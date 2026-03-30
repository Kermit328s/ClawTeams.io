/**
 * 双向对照服务
 * 工作流变更 ↔ 意图图谱的一致性校验
 *
 * 强制对齐原则：任何工作流变更都必须能回溯到一个意图节点。
 * 无法回溯的变更标记为"意图孤立"（intent_orphan）。
 */

import type { Session as Neo4jSession } from 'neo4j-driver';

// ─── 对照结果 ───
export interface AlignmentCheckResult {
  /** 工作流节点 ID */
  workflow_node_id: string;
  /** 是否已关联意图 */
  aligned: boolean;
  /** 关联的意图节点 ID（如有） */
  intent_node_id?: string;
  /** 意图层级 */
  intent_layer?: string;
  /** 对照状态 */
  status: 'aligned' | 'intent_orphan' | 'intent_stale';
  /** 说明 */
  message: string;
}

// ─── 意图影响分析 ───
export interface IntentImpactAnalysis {
  /** 意图节点 ID */
  intent_node_id: string;
  /** 受影响的工作流节点 ID 列表 */
  affected_workflow_nodes: string[];
  /** 影响类型 */
  impact_type: 'priority_change' | 'status_change' | 'scope_change' | 'removal';
  /** 建议操作 */
  suggested_actions: string[];
}

// ─── 双向对照服务 ───
export class AlignmentService {
  constructor(private readonly neo4j: Neo4jSession) {}

  /**
   * 向上对照：工作流节点 → 意图图谱
   * 检查一个工作流变更是否关联到意图节点
   */
  async checkWorkflowAlignment(workflowNodeId: string, intentNodeId?: string): Promise<AlignmentCheckResult> {
    if (intentNodeId) {
      // 验证指定的意图节点是否存在
      const intentResult = await this.neo4j.run(
        `MATCH (g:Goal {id: $intent_id}) RETURN g.id AS id, g.layer AS layer, g.status AS status`,
        { intent_id: intentNodeId },
      );

      if (intentResult.records.length === 0) {
        return {
          workflow_node_id: workflowNodeId,
          aligned: false,
          status: 'intent_orphan',
          message: `Referenced intent node ${intentNodeId} does not exist`,
        };
      }

      const record = intentResult.records[0];
      const intentStatus = record.get('status');
      if (intentStatus === 'cancelled' || intentStatus === 'completed') {
        return {
          workflow_node_id: workflowNodeId,
          aligned: false,
          intent_node_id: intentNodeId,
          intent_layer: record.get('layer'),
          status: 'intent_stale',
          message: `Intent node ${intentNodeId} is ${intentStatus}, workflow may be outdated`,
        };
      }

      // 创建 RELATES_TO 关联
      await this.neo4j.run(
        `MATCH (t:Task {id: $task_id}), (g:Goal {id: $intent_id})
         MERGE (t)-[:RELATES_TO {relevance: 1.0}]->(g)`,
        { task_id: workflowNodeId, intent_id: intentNodeId },
      );

      return {
        workflow_node_id: workflowNodeId,
        aligned: true,
        intent_node_id: intentNodeId,
        intent_layer: record.get('layer'),
        status: 'aligned',
        message: 'Workflow node is aligned with intent',
      };
    }

    // 没有指定意图节点，检查是否已有关联
    const existingResult = await this.neo4j.run(
      `MATCH (t:Task {id: $task_id})-[:RELATES_TO|BELONGS_TO]->(g:Goal)
       RETURN g.id AS id, g.layer AS layer LIMIT 1`,
      { task_id: workflowNodeId },
    );

    if (existingResult.records.length > 0) {
      const record = existingResult.records[0];
      return {
        workflow_node_id: workflowNodeId,
        aligned: true,
        intent_node_id: record.get('id'),
        intent_layer: record.get('layer'),
        status: 'aligned',
        message: 'Workflow node has existing intent alignment',
      };
    }

    // 标记为意图孤立
    await this.neo4j.run(
      `MATCH (t:Task {id: $task_id})
       SET t.intent_orphan = true, t.intent_orphan_since = datetime()`,
      { task_id: workflowNodeId },
    );

    return {
      workflow_node_id: workflowNodeId,
      aligned: false,
      status: 'intent_orphan',
      message: 'Workflow node has no intent alignment. Marked as intent_orphan.',
    };
  }

  /**
   * 批量对照：检查多个工作流节点
   */
  async batchCheckAlignment(workflowNodeIds: string[]): Promise<AlignmentCheckResult[]> {
    const results: AlignmentCheckResult[] = [];
    for (const nodeId of workflowNodeIds) {
      results.push(await this.checkWorkflowAlignment(nodeId));
    }
    return results;
  }

  /**
   * 向下对照：意图变更 → 影响的工作流
   * 当意图节点发生变更时，分析对下游工作流的影响
   */
  async analyzeIntentImpact(
    intentNodeId: string,
    impactType: IntentImpactAnalysis['impact_type'],
  ): Promise<IntentImpactAnalysis> {
    // 查找所有关联的工作流节点
    const result = await this.neo4j.run(
      `MATCH (t:Task)-[:RELATES_TO|BELONGS_TO]->(g:Goal {id: $intent_id})
       RETURN t.id AS task_id`,
      { intent_id: intentNodeId },
    );

    const affectedNodes = result.records.map((r) => r.get('task_id') as string);

    // 也查找子目标关联的任务
    const childResult = await this.neo4j.run(
      `MATCH (child:Goal)-[:BELONGS_TO*]->(g:Goal {id: $intent_id})
       OPTIONAL MATCH (t:Task)-[:RELATES_TO|BELONGS_TO]->(child)
       RETURN t.id AS task_id`,
      { intent_id: intentNodeId },
    );

    const childTasks = childResult.records
      .filter((r) => r.get('task_id') != null)
      .map((r) => r.get('task_id') as string);

    const allAffected = [...new Set([...affectedNodes, ...childTasks])];

    const suggestedActions = this.deriveSuggestedActions(impactType, allAffected.length);

    return {
      intent_node_id: intentNodeId,
      affected_workflow_nodes: allAffected,
      impact_type: impactType,
      suggested_actions: suggestedActions,
    };
  }

  /**
   * 获取所有意图孤立的工作流节点
   */
  async listOrphanedWorkflowNodes(teamId: string): Promise<string[]> {
    const result = await this.neo4j.run(
      `MATCH (t:Task)
       WHERE t.intent_orphan = true
       AND NOT (t)-[:RELATES_TO|BELONGS_TO]->(:Goal)
       AND EXISTS {
         MATCH (t)-[:BELONGS_TO]->(:Goal {team_id: $team_id})
       }
       RETURN t.id AS task_id`,
      { team_id: teamId },
    );
    return result.records.map((r) => r.get('task_id') as string);
  }

  /**
   * 解除意图孤立标记（补充关联后调用）
   */
  async resolveOrphan(workflowNodeId: string, intentNodeId: string): Promise<AlignmentCheckResult> {
    // 移除孤立标记
    await this.neo4j.run(
      `MATCH (t:Task {id: $task_id})
       REMOVE t.intent_orphan, t.intent_orphan_since`,
      { task_id: workflowNodeId },
    );

    return this.checkWorkflowAlignment(workflowNodeId, intentNodeId);
  }

  private deriveSuggestedActions(impactType: string, affectedCount: number): string[] {
    const actions: string[] = [];
    switch (impactType) {
      case 'priority_change':
        actions.push(`Review and re-prioritize ${affectedCount} affected workflow nodes`);
        break;
      case 'status_change':
        actions.push(`Update status of ${affectedCount} affected workflow nodes`);
        actions.push('Notify assigned agents of intent status change');
        break;
      case 'scope_change':
        actions.push(`Re-evaluate scope for ${affectedCount} affected workflow nodes`);
        actions.push('Consider adding/removing workflow nodes');
        break;
      case 'removal':
        actions.push(`Cancel or reassign ${affectedCount} affected workflow nodes`);
        actions.push('Mark affected nodes as intent_orphan if no replacement intent');
        break;
    }
    return actions;
  }
}
