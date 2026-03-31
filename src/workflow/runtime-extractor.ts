// ============================================================
// 运行时工作流关系提取 — 从数据库事件提取动态边
// ============================================================

import { Database } from '../store/database';
import { WorkflowEdge } from './types';

interface DbRelation {
  source_agent_id: string;
  target_agent_id: string;
  relation_type: string;
  strength: number;
  source_info: string | null;
}

interface DbExecution {
  id: number;
  agent_id: string;
  claw_id: string;
  session_id: string;
  trigger: string;
  status: string;
  parent_execution_id: string | null;
  started_at: string;
  completed_at: string | null;
}

/**
 * 从运行时数据提取动态工作流关系
 */
export class RuntimeExtractor {
  constructor(private db: Database) {}

  /**
   * 提取所有动态边
   */
  extractAll(workspaceId: string): Partial<WorkflowEdge>[] {
    const edges: Partial<WorkflowEdge>[] = [];

    edges.push(...this.extractFromSubagentEvents(workspaceId));
    edges.push(...this.extractFromArtifactFlow(workspaceId));
    edges.push(...this.extractFromCollaborations(workspaceId));
    edges.push(...this.extractFromSequence(workspaceId));

    return edges;
  }

  /**
   * 从 subagent 事件提取边
   * 数据来源: agent_relations 表中 relation_type = 'subagent'
   */
  extractFromSubagentEvents(workspaceId: string): Partial<WorkflowEdge>[] {
    const relations = this.db.getAllRelationsForWorkspace(workspaceId) as DbRelation[];
    const allRelations = relations.length > 0
      ? relations
      : this.db.getAllRelationsForWorkspace() as DbRelation[];

    return allRelations
      .filter(r => r.relation_type === 'subagent')
      .map(r => ({
        id: `dynamic-subagent-${r.source_agent_id}-${r.target_agent_id}`,
        source: r.source_agent_id,
        target: r.target_agent_id,
        type: 'subagent' as const,
        data: {
          label: r.source_info ?? 'subagent spawn',
          strength: r.strength,
          source_info: 'subagent_event',
        },
        animated: true,
      }));
  }

  /**
   * 从档案传递关系提取边
   * 数据来源: agent_relations 表中 relation_type = 'data_flow'
   */
  extractFromArtifactFlow(workspaceId: string): Partial<WorkflowEdge>[] {
    const relations = this.db.getAllRelationsForWorkspace(workspaceId) as DbRelation[];
    const allRelations = relations.length > 0
      ? relations
      : this.db.getAllRelationsForWorkspace() as DbRelation[];

    return allRelations
      .filter(r => r.relation_type === 'data_flow')
      .map(r => ({
        id: `dynamic-dataflow-${r.source_agent_id}-${r.target_agent_id}`,
        source: r.source_agent_id,
        target: r.target_agent_id,
        type: 'data_flow' as const,
        data: {
          label: r.source_info ?? 'data flow',
          strength: r.strength,
          source_info: 'artifact_flow',
        },
        animated: false,
      }));
  }

  /**
   * 从协作关系提取边
   * 数据来源: agent_relations 表中 relation_type = 'collaboration'
   */
  extractFromCollaborations(workspaceId: string): Partial<WorkflowEdge>[] {
    const relations = this.db.getAllRelationsForWorkspace(workspaceId) as DbRelation[];
    const allRelations = relations.length > 0
      ? relations
      : this.db.getAllRelationsForWorkspace() as DbRelation[];

    return allRelations
      .filter(r => r.relation_type === 'collaboration')
      .map(r => ({
        id: `dynamic-collab-${r.source_agent_id}-${r.target_agent_id}`,
        source: r.source_agent_id,
        target: r.target_agent_id,
        type: 'collaboration' as const,
        data: {
          label: r.source_info ?? 'collaboration',
          strength: r.strength,
          source_info: 'collaboration_event',
        },
        animated: false,
      }));
  }

  /**
   * 从时序关系提取边
   * 如果两个不同 Agent 在同一个 session 中先后执行，建立弱关联
   */
  extractFromSequence(workspaceId: string): Partial<WorkflowEdge>[] {
    const edges: Partial<WorkflowEdge>[] = [];

    try {
      // 查询最近的执行记录，按 session 分组，找出同 session 中不同 agent 的时序关系
      const recentExecutions = this.db.rawAll(`
        SELECT agent_id, session_id, started_at
        FROM executions
        WHERE session_id IS NOT NULL
        ORDER BY session_id, started_at ASC
        LIMIT 500
      `) as DbExecution[];

      // 按 session 分组
      const sessionMap = new Map<string, DbExecution[]>();
      for (const exec of recentExecutions) {
        if (!exec.session_id) continue;
        const list = sessionMap.get(exec.session_id) ?? [];
        list.push(exec);
        sessionMap.set(exec.session_id, list);
      }

      // 同 session 中连续不同 agent 建立 sequence 边
      const seqSeen = new Set<string>();
      for (const [, execs] of sessionMap) {
        for (let i = 0; i < execs.length - 1; i++) {
          const a = execs[i];
          const b = execs[i + 1];
          if (a.agent_id !== b.agent_id) {
            const key = `${a.agent_id}->${b.agent_id}`;
            if (!seqSeen.has(key)) {
              seqSeen.add(key);
              edges.push({
                id: `dynamic-seq-${a.agent_id}-${b.agent_id}`,
                source: a.agent_id,
                target: b.agent_id,
                type: 'sequence' as const,
                data: {
                  label: '时序关联',
                  strength: 1,
                  source_info: 'sequence_inference',
                },
                animated: false,
                style: { strokeDasharray: '5 5' },
              });
            }
          }
        }
      }
    } catch {
      // 查询失败（表可能不存在），返回空
    }

    return edges;
  }
}
