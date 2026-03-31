// ============================================================
// 工作流图合并器 — 技能级节点版本
// ============================================================

import { AgentRegistration } from '../tracker/types';
import {
  WorkflowNode,
  WorkflowEdge,
  WorkflowGraph,
  AgentGroupNode,
  AgentSkillChain,
  EDGE_STYLES,
} from './types';

interface AgentStatus {
  status: 'idle' | 'running' | 'failed';
  stats: {
    today_total: number;
    today_succeeded: number;
    today_failed: number;
    today_tokens?: number;
    recent_10min_tokens?: number;
  };
}

/**
 * 合并技能级节点和边，生成最终 WorkflowGraph
 */
export class GraphMerger {
  /**
   * 合并生成最终工作流图（技能级）
   */
  merge(
    _agents: AgentRegistration[],
    skillNodes: WorkflowNode[],
    skillEdges: WorkflowEdge[],
    groupNodes: AgentGroupNode[],
    dynamicEdges: Partial<WorkflowEdge>[],
    agentStatuses: Map<string, AgentStatus>,
  ): WorkflowGraph {
    // 1. 填充实时状态到技能节点
    for (const node of skillNodes) {
      const agentStatus = agentStatuses.get(node.data.agent_id);
      if (agentStatus) {
        // 如果 agent 正在运行，将最后一个技能标记为 running
        if (agentStatus.status === 'running') {
          // 找该 Agent 的所有技能
          const sameAgentSkills = skillNodes.filter(n => n.data.agent_id === node.data.agent_id);
          const maxIndex = Math.max(...sameAgentSkills.map(n => n.data.skill_index));
          if (node.data.skill_index === maxIndex) {
            node.data.status = 'running';
          } else {
            node.data.status = 'completed';
          }
        }

        // 分配 token 统计（均分到各技能）
        const agentSkillCount = skillNodes.filter(n => n.data.agent_id === node.data.agent_id).length;
        if (agentSkillCount > 0) {
          node.data.execution_stats = {
            total: Math.ceil(agentStatus.stats.today_total / agentSkillCount),
            succeeded: Math.ceil(agentStatus.stats.today_succeeded / agentSkillCount),
            failed: Math.ceil(agentStatus.stats.today_failed / agentSkillCount),
            tokens: Math.ceil((agentStatus.stats.today_tokens || 0) / agentSkillCount),
          };
        }
      }
    }

    // 2. 合并所有边
    const allEdges = [...skillEdges];

    // 将动态边（Agent 级）转换为技能级连接
    for (const dynEdge of dynamicEdges) {
      if (!dynEdge.source || !dynEdge.target) continue;
      // 动态边连接的是 agent_id，需要找到对应的最后技能 → 第一技能
      const sourceSkills = skillNodes
        .filter(n => n.data.agent_id === dynEdge.source)
        .sort((a, b) => b.data.skill_index - a.data.skill_index);
      const targetSkills = skillNodes
        .filter(n => n.data.agent_id === dynEdge.target)
        .sort((a, b) => a.data.skill_index - b.data.skill_index);

      if (sourceSkills.length > 0 && targetSkills.length > 0) {
        const sourceSkillId = sourceSkills[0].id;
        const targetSkillId = targetSkills[0].id;
        const edgeId = `dynamic-${sourceSkillId}-${targetSkillId}-${dynEdge.type || 'data_flow'}`;

        // 避免与已有 cross_agent 边重复
        const existingCross = allEdges.find(
          e => e.source === sourceSkillId && e.target === targetSkillId,
        );
        if (!existingCross) {
          allEdges.push({
            id: edgeId,
            source: sourceSkillId,
            target: targetSkillId,
            type: (dynEdge.type as WorkflowEdge['type']) || 'data_flow',
            data: {
              label: dynEdge.data?.label ?? '',
              strength: dynEdge.data?.strength ?? 1,
              source_info: dynEdge.data?.source_info ?? 'dynamic',
            },
            animated: dynEdge.animated,
            style: dynEdge.style,
          });
        }
      }
    }

    // 3. 给边添加样式
    for (const edge of allEdges) {
      if (!edge.style) {
        const typeStyle = EDGE_STYLES[edge.type];
        if (typeStyle) {
          edge.style = {
            stroke: typeStyle.stroke,
            strokeWidth: typeStyle.strokeWidth,
            ...(typeStyle.dashArray ? { strokeDasharray: typeStyle.dashArray } : {}),
          };
        }
      }
      // cross_agent 边添加动画
      if (edge.type === 'cross_agent') {
        edge.animated = true;
      }
    }

    // 4. 去重
    const dedupedEdges = this.deduplicateEdges(allEdges);

    // 5. 统计
    const dataSources = new Set<string>();
    for (const e of dedupedEdges) {
      if (e.data?.source_info) dataSources.add(e.data.source_info);
    }

    return {
      nodes: [...groupNodes, ...skillNodes],
      edges: dedupedEdges,
      metadata: {
        generated_at: Date.now(),
        static_edge_count: skillEdges.length,
        dynamic_edge_count: dynamicEdges.length,
        data_sources: Array.from(dataSources),
      },
    };
  }

  /**
   * 去重并合并边
   */
  deduplicateEdges(edges: WorkflowEdge[]): WorkflowEdge[] {
    const edgeMap = new Map<string, WorkflowEdge>();

    for (const edge of edges) {
      if (!edge.source || !edge.target) continue;
      const key = `${edge.source}->${edge.target}:${edge.type}`;
      const existing = edgeMap.get(key);

      if (existing) {
        existing.data.strength += edge.data?.strength ?? 1;
        if (edge.data?.label && edge.data.label.length > existing.data.label.length) {
          existing.data.label = edge.data.label;
        }
        if (edge.animated) existing.animated = true;
      } else {
        edgeMap.set(key, { ...edge });
      }
    }

    return Array.from(edgeMap.values());
  }
}
