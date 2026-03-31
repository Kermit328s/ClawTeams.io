// ============================================================
// 工作流图合并器 — 合并静态 + 动态关系，生成最终图
// ============================================================

import { AgentRegistration } from '../tracker/types';
import { WorkflowNode, WorkflowEdge, WorkflowGraph, EDGE_STYLES } from './types';

interface AgentStatus {
  status: 'idle' | 'running' | 'failed';
  stats: {
    today_total: number;
    today_succeeded: number;
    today_failed: number;
  };
}

/**
 * 合并静态 md 解析结果和动态运行时数据，生成最终 WorkflowGraph
 */
export class GraphMerger {
  /**
   * 合并生成最终工作流图
   */
  merge(
    agents: AgentRegistration[],
    staticResult: { nodes: Partial<WorkflowNode>[]; edges: Partial<WorkflowEdge>[] },
    dynamicEdges: Partial<WorkflowEdge>[],
    agentStatuses: Map<string, AgentStatus>,
  ): WorkflowGraph {
    // 1. 合并节点：确保所有 Agent 都有对应节点
    const nodes = this.buildNodes(agents, staticResult.nodes, agentStatuses);

    // 2. 合并边：静态边 + 动态边
    const allEdges = [...staticResult.edges, ...dynamicEdges];
    const edges = this.deduplicateEdges(allEdges);

    // 3. 给边添加样式
    for (const edge of edges) {
      if (!edge.style) {
        const typeStyle = EDGE_STYLES[edge.type];
        if (typeStyle) {
          edge.style = { stroke: typeStyle.stroke, strokeWidth: typeStyle.strokeWidth };
        }
      }
      // 动态边（subagent）添加动画
      if (edge.type === 'subagent') {
        edge.animated = true;
      }
    }

    // 4. 统计
    const staticEdgeCount = staticResult.edges.length;
    const dynamicEdgeCount = dynamicEdges.length;
    const dataSources = new Set<string>();
    for (const e of edges) {
      if (e.data?.source_info) {
        dataSources.add(e.data.source_info);
      }
    }

    return {
      nodes,
      edges,
      metadata: {
        generated_at: Date.now(),
        static_edge_count: staticEdgeCount,
        dynamic_edge_count: dynamicEdgeCount,
        data_sources: Array.from(dataSources),
      },
    };
  }

  /**
   * 构建完整的节点列表
   * 确保所有注册的 Agent 都有节点，即使 md 中没有提到
   */
  private buildNodes(
    agents: AgentRegistration[],
    staticNodes: Partial<WorkflowNode>[],
    agentStatuses: Map<string, AgentStatus>,
  ): WorkflowNode[] {
    const nodeMap = new Map<string, WorkflowNode>();

    // 先从静态节点填充
    for (const sNode of staticNodes) {
      if (!sNode.data?.agent_id) continue;
      const id = sNode.data.agent_id;
      nodeMap.set(id, {
        id,
        type: 'agent',
        position: sNode.position ?? { x: 0, y: 0 },
        data: {
          agent_id: id,
          name: sNode.data.name ?? id,
          emoji: sNode.data.emoji ?? '',
          role: sNode.data.role ?? '',
          status: 'idle',
          model: sNode.data.model ?? '',
          is_crosscut: sNode.data.is_crosscut ?? false,
          execution_stats: { today_total: 0, today_succeeded: 0, today_failed: 0 },
        },
      });
    }

    // 确保所有注册 Agent 都有节点
    for (const agent of agents) {
      if (!nodeMap.has(agent.agent_id)) {
        const isCrosscut = /redteam/i.test(agent.agent_id);
        nodeMap.set(agent.agent_id, {
          id: agent.agent_id,
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            agent_id: agent.agent_id,
            name: agent.name,
            emoji: agent.emoji,
            role: '',
            status: 'idle',
            model: agent.model,
            is_crosscut: isCrosscut,
            execution_stats: { today_total: 0, today_succeeded: 0, today_failed: 0 },
          },
        });
      }
    }

    // 填充实时状态
    for (const [agentId, status] of agentStatuses.entries()) {
      const node = nodeMap.get(agentId);
      if (node) {
        node.data.status = status.status;
        node.data.execution_stats = status.stats;
      }
    }

    return Array.from(nodeMap.values());
  }

  /**
   * 去重并合并边
   * 相同 source -> target 和 type 的边合并，strength 累加
   */
  deduplicateEdges(edges: Partial<WorkflowEdge>[]): WorkflowEdge[] {
    const edgeMap = new Map<string, WorkflowEdge>();

    for (const edge of edges) {
      if (!edge.source || !edge.target || !edge.type) continue;

      const key = `${edge.source}->${edge.target}:${edge.type}`;
      const existing = edgeMap.get(key);

      if (existing) {
        // 合并：累加 strength，保留更好的 label
        existing.data.strength += edge.data?.strength ?? 1;
        if (edge.data?.label && edge.data.label !== edge.type) {
          // 如果新 label 更具体，用新的
          if (edge.data.label.length > existing.data.label.length) {
            existing.data.label = edge.data.label;
          }
        }
        // 如果有动画属性，保留
        if (edge.animated) {
          existing.animated = true;
        }
        // 合并 source_info
        if (edge.data?.source_info && !existing.data.source_info.includes(edge.data.source_info)) {
          existing.data.source_info += `, ${edge.data.source_info}`;
        }
      } else {
        edgeMap.set(key, {
          id: edge.id ?? `edge-${edge.source}-${edge.target}-${edge.type}`,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          data: {
            label: edge.data?.label ?? edge.type,
            strength: edge.data?.strength ?? 1,
            source_info: edge.data?.source_info ?? 'unknown',
          },
          animated: edge.animated,
          style: edge.style,
        });
      }
    }

    return Array.from(edgeMap.values());
  }
}
