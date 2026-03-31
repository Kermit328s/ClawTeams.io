// ============================================================
// 工作流图自动生成 — 从 md + 运行数据合并（Sprint 3 重构版）
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
 * 工作流图生成器（Sprint 3 版本）
 *
 * 使用三层架构:
 * 1. GraphExtractor — 从 md 文件提取静态关系
 * 2. RuntimeExtractor — 从运行时数据提取动态关系
 * 3. GraphMerger — 合并+去重+布局
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
   * 生成完整的工作流图（含位置、样式等 React Flow 字段）
   */
  buildGraph(workspaceId: string): WorkflowGraph {
    // 1. 获取所有 Agent
    const agents = this.getAgents(workspaceId);

    // 2. 从 md 文件提取静态关系
    const clawId = this.getClawId(workspaceId);
    const staticResult = this.graphExtractor.extractFromMdFiles(clawId, agents);

    // 3. 从运行时数据提取动态关系
    const dynamicEdges = this.runtimeExtractor.extractAll(workspaceId);

    // 4. 获取 Agent 实时状态
    const agentStatuses = this.getAgentStatuses(agents);

    // 5. 合并生成最终图
    const graph = this.graphMerger.merge(agents, staticResult, dynamicEdges, agentStatuses);

    // 6. 计算布局
    graph.nodes = GraphLayout.layout(graph.nodes, graph.edges);

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
   * 获取第一个 Claw ID（用于 md 解析上下文）
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
  ): Map<string, { status: 'idle' | 'running' | 'failed'; stats: { today_total: number; today_succeeded: number; today_failed: number } }> {
    const statuses = new Map<string, { status: 'idle' | 'running' | 'failed'; stats: { today_total: number; today_succeeded: number; today_failed: number } }>();

    for (const agent of agents) {
      try {
        const profile = this.db.getAgentProfile(agent.agent_id) as { status?: string } | undefined;
        const stats = this.db.getExecutionStats(agent.agent_id, 'today');

        statuses.set(agent.agent_id, {
          status: (profile?.status as 'idle' | 'running' | 'failed') ?? 'idle',
          stats: {
            today_total: stats.total,
            today_succeeded: stats.succeeded,
            today_failed: stats.failed,
          },
        });
      } catch {
        statuses.set(agent.agent_id, {
          status: 'idle',
          stats: { today_total: 0, today_succeeded: 0, today_failed: 0 },
        });
      }
    }

    return statuses;
  }
}
