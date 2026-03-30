/**
 * 执行策略引擎（Execution Planner）
 * 能力匹配、执行路径优化、风险识别、生成执行计划
 */

import type { AgentIdentity } from '../../infra/shared';
import type {
  WorkflowDAG,
  WorkflowNode,
  WorkflowEdge,
  ExecutionPlan,
  ExecutionStage,
  TaskAssignment,
  RiskAssessment,
} from '../types';
import { buildAdjacencyList, buildReverseAdjacencyList } from '../parser';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * 为节点匹配最佳龙虾
 */
export function matchCapability(
  node: WorkflowNode,
  agents: AgentIdentity[],
): { agent: AgentIdentity; matched: string[]; confidence: number } | null {
  if (node.type === 'Human' || node.type === 'Goal') {
    return null;
  }

  const requiredCaps = node.required_capabilities ?? [];
  if (requiredCaps.length === 0) {
    // 没有明确能力要求，选择状态在线的第一个可用龙虾
    const available = agents.filter((a) => a.status === 'online');
    if (available.length === 0) return null;
    return { agent: available[0], matched: [], confidence: 0.5 };
  }

  let bestMatch: { agent: AgentIdentity; matched: string[]; confidence: number } | null = null;

  for (const agent of agents) {
    if (agent.status === 'offline') continue;

    const agentCapNames = agent.capabilities.map((c) => c.name);
    const matched = requiredCaps.filter((req) => agentCapNames.includes(req));
    const confidence = requiredCaps.length > 0 ? matched.length / requiredCaps.length : 0;

    if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { agent, matched, confidence };
    }
  }

  return bestMatch;
}

/**
 * 识别可并行的任务组
 * 返回按阶段分组的节点 ID 列表（同阶段可并行执行）
 */
export function identifyParallelStages(dag: WorkflowDAG): string[][] {
  const adjacency = buildAdjacencyList(dag.nodes, dag.edges);

  // 忽略 LOOP_BACK 和 PARALLEL_WITH 边计算层级
  // PARALLEL_WITH 表示并行关系，不构成依赖
  const effectiveEdges = dag.edges.filter(
    (e) => e.edge_type !== 'LOOP_BACK' && e.edge_type !== 'PARALLEL_WITH',
  );
  const inDegree = new Map<string, number>();

  for (const node of dag.nodes) {
    inDegree.set(node.id, 0);
  }
  for (const edge of effectiveEdges) {
    inDegree.set(edge.to_id, (inDegree.get(edge.to_id) ?? 0) + 1);
  }

  // 按层级 BFS 分组
  const stages: string[][] = [];
  let currentLevel = dag.nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  const visited = new Set<string>();

  while (currentLevel.length > 0) {
    stages.push([...currentLevel]);
    for (const id of currentLevel) {
      visited.add(id);
    }

    const nextLevel: string[] = [];
    for (const nodeId of currentLevel) {
      const neighbors = adjacency.get(nodeId) ?? [];
      for (const edge of neighbors) {
        if (edge.edge_type === 'LOOP_BACK' || edge.edge_type === 'PARALLEL_WITH') continue;
        if (visited.has(edge.to_id)) continue;

        const newDeg = (inDegree.get(edge.to_id) ?? 1) - 1;
        inDegree.set(edge.to_id, newDeg);

        if (newDeg === 0 && !nextLevel.includes(edge.to_id)) {
          nextLevel.push(edge.to_id);
        }
      }
    }

    currentLevel = nextLevel;
  }

  return stages;
}

/**
 * 识别风险
 */
export function identifyRisks(
  dag: WorkflowDAG,
  agents: AgentIdentity[],
): RiskAssessment[] {
  const risks: RiskAssessment[] = [];
  const adjacency = buildAdjacencyList(dag.nodes, dag.edges);
  const reverseAdj = buildReverseAdjacencyList(dag.nodes, dag.edges);

  for (const node of dag.nodes) {
    if (node.type === 'Goal') continue;

    // 瓶颈检测：出度 > 2 的节点是分发瓶颈，入度 > 2 的是聚合瓶颈
    const outEdges = adjacency.get(node.id) ?? [];
    const inEdges = reverseAdj.get(node.id) ?? [];

    if (outEdges.length > 2 || inEdges.length > 2) {
      risks.push({
        type: 'bottleneck',
        node_ids: [node.id],
        description: `节点 "${node.label}" 是瓶颈（入度=${inEdges.length}, 出度=${outEdges.length}）`,
        severity: outEdges.length > 3 || inEdges.length > 3 ? 'high' : 'medium',
        mitigation: '考虑将大扇出/扇入节点拆分，或增加缓冲队列',
      });
    }

    // 单点故障：关键路径上只有一个龙虾能承接的 Task 节点
    if (node.type === 'Task' && dag.critical_path.includes(node.id)) {
      const match = matchCapability(node, agents);
      if (!match) {
        risks.push({
          type: 'no_capable_agent',
          node_ids: [node.id],
          description: `关键路径节点 "${node.label}" 没有可用龙虾`,
          severity: 'critical',
          mitigation: '需要注册具备相关能力的龙虾',
        });
      } else {
        const capableAgents = agents.filter((a) => {
          if (a.status === 'offline') return false;
          const caps = a.capabilities.map((c) => c.name);
          return (node.required_capabilities ?? []).some((r) => caps.includes(r));
        });
        if (capableAgents.length === 1) {
          risks.push({
            type: 'single_point_of_failure',
            node_ids: [node.id],
            description: `关键路径节点 "${node.label}" 只有一个龙虾 "${capableAgents[0].name}" 能承接`,
            severity: 'high',
            mitigation: '建议增加备用龙虾以防单点故障',
          });
        }
      }
    }

    // 长耗时任务
    if (
      node.estimated_duration_minutes &&
      node.estimated_duration_minutes > 60
    ) {
      risks.push({
        type: 'long_running',
        node_ids: [node.id],
        description: `节点 "${node.label}" 预估耗时 ${node.estimated_duration_minutes} 分钟`,
        severity: node.estimated_duration_minutes > 240 ? 'high' : 'medium',
        mitigation: '考虑将长耗时任务拆分为子任务，或设置超时检查点',
      });
    }
  }

  return risks;
}

/**
 * 生成执行计划
 */
export function generateExecutionPlan(
  dag: WorkflowDAG,
  agents: AgentIdentity[],
  workflowId?: string,
): ExecutionPlan {
  const parallelStages = identifyParallelStages(dag);
  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));
  const risks = identifyRisks(dag, agents);

  const stages: ExecutionStage[] = parallelStages.map((stageNodeIds, index) => {
    const assignments: TaskAssignment[] = stageNodeIds.map((nodeId) => {
      const node = nodeMap.get(nodeId)!;

      if (node.type === 'Human') {
        return {
          node_id: nodeId,
          assigned_agent_id: '',
          assigned_agent_name: 'human',
          matched_capabilities: [],
          match_confidence: 1.0,
          is_human: true,
        };
      }

      if (node.type === 'Goal') {
        return {
          node_id: nodeId,
          assigned_agent_id: '',
          assigned_agent_name: 'system',
          matched_capabilities: [],
          match_confidence: 1.0,
          is_human: false,
        };
      }

      const match = matchCapability(node, agents);
      if (match) {
        return {
          node_id: nodeId,
          assigned_agent_id: match.agent.agent_id,
          assigned_agent_name: match.agent.name,
          matched_capabilities: match.matched,
          match_confidence: match.confidence,
          is_human: false,
        };
      }

      return {
        node_id: nodeId,
        assigned_agent_id: '',
        assigned_agent_name: 'unassigned',
        matched_capabilities: [],
        match_confidence: 0,
        is_human: false,
      };
    });

    const maxDuration = Math.max(
      ...stageNodeIds.map((id) => nodeMap.get(id)?.estimated_duration_minutes ?? 10),
    );

    return {
      stage_index: index,
      assignments,
      parallel: stageNodeIds.length > 1,
      estimated_duration_minutes: maxDuration,
    };
  });

  const estimatedTotal = stages.reduce((sum, s) => sum + s.estimated_duration_minutes, 0);

  return {
    plan_id: generateId(),
    goal_id: dag.goal_id,
    workflow_id: workflowId ?? generateId(),
    stages,
    risks,
    estimated_total_minutes: estimatedTotal,
    created_at: new Date().toISOString(),
  };
}
