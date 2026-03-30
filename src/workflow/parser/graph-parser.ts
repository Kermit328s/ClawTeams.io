/**
 * 图谱解析器（Graph Parser）
 * 从意图图谱的 JSON 结构解析出可执行的工作流 DAG
 */

import type {
  IntentSubGraph,
  BaseNode,
  GoalNode,
  TaskNode,
  DecisionNode,
  HumanNode,
  GraphEdge,
  IntentNodeType,
  IntentEdgeType,
} from '../../infra/shared';

import type { WorkflowDAG, WorkflowNode, WorkflowEdge } from '../types';

// 工作流相关的节点类型（排除组织结构类型）
const WORKFLOW_NODE_TYPES: Set<IntentNodeType> = new Set([
  'Goal',
  'Task',
  'Decision',
  'Human',
]);

// 工作流相关的边类型
const WORKFLOW_EDGE_TYPES: Set<IntentEdgeType> = new Set([
  'DEPENDS_ON',
  'PARALLEL_WITH',
  'CONDITION',
  'AGGREGATES',
  'LOOP_BACK',
]);

/**
 * 将 IntentSubGraph 解析为 WorkflowDAG
 */
export function parseIntentGraph(subGraph: IntentSubGraph): WorkflowDAG {
  // 1. 过滤出工作流相关的节点和边
  const workflowNodes = filterWorkflowNodes(subGraph.nodes);
  const nodeIdSet = new Set(workflowNodes.map((n) => n.id));
  const workflowEdges = filterWorkflowEdges(subGraph.edges, nodeIdSet);

  // 2. 转换节点
  const dagNodes = workflowNodes.map(convertNode);

  // 3. 转换边
  const dagEdges = workflowEdges.map(convertEdge);

  // 4. 构建邻接表
  const adjacency = buildAdjacencyList(dagNodes, dagEdges);
  const reverseAdjacency = buildReverseAdjacencyList(dagNodes, dagEdges);

  // 5. 检测回环
  const cycles = detectCycles(dagNodes, adjacency);
  const hasCycles = cycles.length > 0;

  // 6. 拓扑排序
  const topologicalOrder = topologicalSort(dagNodes, dagEdges, adjacency, hasCycles);

  // 7. 计算入口和出口节点
  const entryNodes = dagNodes
    .filter((n) => !reverseAdjacency.has(n.id) || reverseAdjacency.get(n.id)!.length === 0)
    .map((n) => n.id);

  const exitNodes = dagNodes
    .filter((n) => !adjacency.has(n.id) || adjacency.get(n.id)!.length === 0)
    .map((n) => n.id);

  // 8. 关键路径分析
  const criticalPath = computeCriticalPath(dagNodes, dagEdges, topologicalOrder, adjacency);

  return {
    goal_id: subGraph.goal_id,
    version: subGraph.version,
    nodes: dagNodes,
    edges: dagEdges,
    topological_order: topologicalOrder,
    critical_path: criticalPath,
    has_cycles: hasCycles,
    cycles,
    entry_nodes: entryNodes,
    exit_nodes: exitNodes,
  };
}

/**
 * 过滤工作流节点
 */
function filterWorkflowNodes(nodes: BaseNode[]): BaseNode[] {
  return nodes.filter((n) => WORKFLOW_NODE_TYPES.has(n.type));
}

/**
 * 过滤工作流边（两端都在工作流节点集合内）
 */
function filterWorkflowEdges(edges: GraphEdge[], nodeIds: Set<string>): GraphEdge[] {
  return edges.filter(
    (e) => WORKFLOW_EDGE_TYPES.has(e.edge_type) && nodeIds.has(e.from_id) && nodeIds.has(e.to_id),
  );
}

/**
 * 将意图图谱节点转换为工作流节点
 */
function convertNode(node: BaseNode): WorkflowNode {
  const base: WorkflowNode = {
    id: node.id,
    type: node.type,
    label: '',
    metadata: node.metadata,
  };

  switch (node.type) {
    case 'Goal': {
      const g = node as GoalNode;
      base.label = g.title;
      base.priority = g.priority;
      base.deadline = g.deadline;
      break;
    }
    case 'Task': {
      const t = node as TaskNode;
      base.label = t.title;
      base.task_type = t.task_type;
      base.priority = t.priority;
      base.deadline = t.deadline;
      // 从 metadata 中提取 required_capabilities
      if (t.metadata?.required_capabilities) {
        base.required_capabilities = t.metadata.required_capabilities as string[];
      }
      if (t.metadata?.estimated_duration_minutes) {
        base.estimated_duration_minutes = t.metadata.estimated_duration_minutes as number;
      }
      break;
    }
    case 'Decision': {
      const d = node as DecisionNode;
      base.label = d.question;
      base.condition_expr = d.metadata?.condition_expr as string | undefined;
      if (d.options) {
        base.decision_options = d.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          target_node_id: (opt as unknown as Record<string, string>).target_node_id ?? '',
        }));
      }
      break;
    }
    case 'Human': {
      const h = node as HumanNode;
      base.label = h.title;
      base.human_description = h.description;
      break;
    }
  }

  return base;
}

/**
 * 将意图图谱边转换为工作流边
 */
function convertEdge(edge: GraphEdge): WorkflowEdge {
  return {
    id: edge.id,
    from_id: edge.from_id,
    to_id: edge.to_id,
    edge_type: edge.edge_type,
    condition_expr: edge.condition_expr,
    weight: edge.weight,
  };
}

/**
 * 构建正向邻接表
 */
export function buildAdjacencyList(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Map<string, WorkflowEdge[]> {
  const adj = new Map<string, WorkflowEdge[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    const list = adj.get(edge.from_id);
    if (list) {
      list.push(edge);
    }
  }
  return adj;
}

/**
 * 构建反向邻接表
 */
export function buildReverseAdjacencyList(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Map<string, WorkflowEdge[]> {
  const adj = new Map<string, WorkflowEdge[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    const list = adj.get(edge.to_id);
    if (list) {
      list.push(edge);
    }
  }
  return adj;
}

/**
 * 检测回环（DFS，返回所有环路径）
 */
export function detectCycles(
  nodes: WorkflowNode[],
  adjacency: Map<string, WorkflowEdge[]>,
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    if (inStack.has(nodeId)) {
      // 找到回环：从 path 中 nodeId 第一次出现位置到末尾
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), nodeId]);
      }
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const edge of neighbors) {
      dfs(edge.to_id);
    }

    path.pop();
    inStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

/**
 * 拓扑排序（Kahn 算法）
 * 对于有回环的图，忽略 LOOP_BACK 边进行排序
 */
export function topologicalSort(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  _adjacency: Map<string, WorkflowEdge[]>,
  hasCycles: boolean,
): string[] {
  // 对有回环的图，排除 LOOP_BACK 边
  const effectiveEdges = hasCycles
    ? edges.filter((e) => e.edge_type !== 'LOOP_BACK')
    : edges;

  // 计算入度
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }
  for (const edge of effectiveEdges) {
    inDegree.set(edge.to_id, (inDegree.get(edge.to_id) ?? 0) + 1);
  }

  // 构建此次排序的邻接表
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of effectiveEdges) {
    adj.get(edge.from_id)!.push(edge.to_id);
  }

  // BFS
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    // 按优先级排序（可选：稳定排序）
    queue.sort();
    const current = queue.shift()!;
    result.push(current);

    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

/**
 * 关键路径分析
 * 基于拓扑序列，使用最长路径算法
 */
export function computeCriticalPath(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  topologicalOrder: string[],
  adjacency: Map<string, WorkflowEdge[]>,
): string[] {
  if (topologicalOrder.length === 0) return [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // 各节点的最早开始时间
  const earliest = new Map<string, number>();
  // 各节点的前驱（用于回溯关键路径）
  const predecessor = new Map<string, string | null>();

  for (const id of topologicalOrder) {
    earliest.set(id, 0);
    predecessor.set(id, null);
  }

  // 正向遍历
  for (const nodeId of topologicalOrder) {
    const currentEarliest = earliest.get(nodeId) ?? 0;
    const node = nodeMap.get(nodeId);
    const duration = node?.estimated_duration_minutes ?? 1;

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const edge of neighbors) {
      if (edge.edge_type === 'LOOP_BACK') continue;
      const neighborEarliest = earliest.get(edge.to_id) ?? 0;
      const newEarliest = currentEarliest + duration;
      if (newEarliest > neighborEarliest) {
        earliest.set(edge.to_id, newEarliest);
        predecessor.set(edge.to_id, nodeId);
      }
    }
  }

  // 找到最晚完成的终点节点
  let maxTime = 0;
  let endNode = topologicalOrder[topologicalOrder.length - 1];
  for (const [id, time] of earliest) {
    if (time > maxTime) {
      maxTime = time;
      endNode = id;
    }
  }

  // 回溯关键路径
  const path: string[] = [];
  let current: string | null = endNode;
  while (current !== null) {
    path.unshift(current);
    current = predecessor.get(current) ?? null;
  }

  return path;
}
