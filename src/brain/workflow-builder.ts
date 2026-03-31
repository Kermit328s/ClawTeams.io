// ============================================================
// 工作流图自动生成 — 技能级小卡片链条版本
// ============================================================

import { Database } from '../store/database';
import { MdParser } from '../tracker/md-parser';
import { AgentRegistration } from '../tracker/types';
import { GraphExtractor } from '../workflow/graph-extractor';
import { RuntimeExtractor } from '../workflow/runtime-extractor';
import { GraphMerger } from '../workflow/graph-merger';
import { GraphLayout } from '../workflow/layout';
import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../workflow/types';

// 保留旧接口的兼容导出
export type { WorkflowNode, WorkflowEdge, WorkflowGraph };

interface DbAgent {
  agent_id: string;
  claw_id: string;
  name: string;
  emoji: string;
  status: string;
  model: string;
  workspace_path: string;
  theme: string;
}

/**
 * 工作流图生成器 — 技能级版本
 *
 * 使用架构:
 * 1. GraphExtractor — 从工作定义 md 提取技能链 + 静态关系
 * 2. RuntimeExtractor — 从运行时数据提取动态关系
 * 3. GraphLayout — 技能卡片行布局
 * 4. GraphMerger — 合并+去重+填充状态
 */
export class WorkflowBuilder {
  private graphExtractor: GraphExtractor;
  private runtimeExtractor: RuntimeExtractor;
  private graphMerger: GraphMerger;

  constructor(
    private db: Database,
    private mdParser: MdParser,
  ) {
    this.graphExtractor = new GraphExtractor(mdParser, db);
    this.runtimeExtractor = new RuntimeExtractor(db);
    this.graphMerger = new GraphMerger();
  }

  /**
   * 生成完整的工作流图（技能级）
   */
  buildGraph(workspaceId: string): WorkflowGraph {
    // 1. 获取所有 Agent
    const agents = this.getAgents(workspaceId);

    // 2. 构建别名映射（供后续解析使用）
    const clawId = this.getClawId(workspaceId);
    this.graphExtractor.buildAliasMap(agents);

    // 3. 从工作定义提取技能链
    const skillChains = this.graphExtractor.extractSkillChains(agents);

    // 4. 从技能链生成节点和边
    const { nodes: skillNodes, edges: skillEdges } = this.graphExtractor.buildSkillGraph(
      skillChains,
      agents,
    );

    // 5. 从运行时数据提取动态关系（Agent 级别，merger 会转换）
    const dynamicEdges = this.runtimeExtractor.extractAll(workspaceId);

    // 6. 计算布局
    const { skillNodes: layoutNodes, groupNodes } = GraphLayout.layout(skillNodes, skillEdges);

    // 7. 获取 Agent 实时状态
    const agentStatuses = this.getAgentStatuses(agents);

    // 8. 合并生成最终图
    const graph = this.graphMerger.merge(
      agents,
      layoutNodes,
      skillEdges,
      groupNodes,
      dynamicEdges,
      agentStatuses,
    );

    return graph;
  }

  /**
   * 获取工作空间下的所有 Agent（转为 AgentRegistration 格式）
   */
  private getAgents(workspaceId: string): AgentRegistration[] {
    const dbAgents = this.db.getAllAgentsForWorkspace(workspaceId) as DbAgent[];
    const agents = dbAgents.length > 0
      ? dbAgents
      : this.db.getAllAgentsForWorkspace() as DbAgent[];

    return agents.map(a => ({
      agent_id: a.agent_id,
      name: a.name,
      emoji: a.emoji,
      theme: a.theme ?? '',
      model: a.model ?? '',
      workspace_path: a.workspace_path ?? '',
    }));
  }

  /**
   * 获取第一个 Claw ID
   */
  private getClawId(workspaceId: string): string {
    const claws = this.db.getClawsByWorkspaceId(workspaceId) as { claw_id: string }[];
    if (claws.length > 0) return claws[0].claw_id;
    const allClaws = this.db.getAllClaws() as { claw_id: string }[];
    return allClaws[0]?.claw_id ?? '';
  }

  /**
   * 获取所有 Agent 的实时状态和执行统计
   */
  private getAgentStatuses(
    agents: AgentRegistration[],
  ): Map<string, { status: 'idle' | 'running' | 'failed'; stats: { today_total: number; today_succeeded: number; today_failed: number; today_tokens?: number; recent_10min_tokens?: number } }> {
    const statuses = new Map<string, { status: 'idle' | 'running' | 'failed'; stats: { today_total: number; today_succeeded: number; today_failed: number; today_tokens?: number; recent_10min_tokens?: number } }>();

    for (const agent of agents) {
      try {
        const profile = this.db.getAgentProfile(agent.agent_id) as { status?: string } | undefined;
        const stats = this.db.getExecutionStats(agent.agent_id, 'today');
        const recent10min = this.db.getRecentTokens(agent.agent_id, 10);

        statuses.set(agent.agent_id, {
          status: (profile?.status as 'idle' | 'running' | 'failed') ?? 'idle',
          stats: {
            today_total: stats.total,
            today_succeeded: stats.succeeded,
            today_failed: stats.failed,
            today_tokens: stats.total_tokens,
            recent_10min_tokens: recent10min,
          },
        });
      } catch {
        statuses.set(agent.agent_id, {
          status: 'idle',
          stats: { today_total: 0, today_succeeded: 0, today_failed: 0, today_tokens: 0, recent_10min_tokens: 0 },
        });
      }
    }

    return statuses;
  }
}
