/**
 * 认知模块服务
 * - 认知触发判断：偏差超出容忍范围时自动写入认知节点
 * - 认知阶段枚举（Hypothesis → Testing → Validated/Invalidated/Partial/Evolved）
 * - AI 直接写入，人工否决机制
 * - 认知演化链追踪
 */

import type { Session as Neo4jSession } from 'neo4j-driver';
import type {
  CognitionRecord,
  CognitionEvolution,
  CognitiveSignal,
} from '../../infra/shared';

// ─── 认知阶段 ───
export type CognitionStage =
  | 'hypothesis'     // 假设 — 我们相信X会发生
  | 'testing'        // 求证中 — 正在验证X
  | 'validated'      // 已验证 — X被证明是对的
  | 'invalidated'    // 已推翻 — X被证明是错的
  | 'partial'        // 部分成立 — X在某些条件下成立
  | 'evolved';       // 认知迭代 — 因为X，对Y的理解改变了

// ─── 认知触发条件 ───
export type CognitionTriggerType =
  | 'hypothesis_invalidated'   // 假设被现实推翻
  | 'repeated_failure'         // 同类执行失败反复出现
  | 'intent_overridden';       // 意图被人工推翻

// ─── 偏差评估 ───
export interface DeviationAssessment {
  /** 任务 ID */
  task_id: string;
  /** 预期结果 */
  expected: Record<string, unknown>;
  /** 实际结果 */
  actual: Record<string, unknown>;
  /** 偏差度（0-1，0=完全一致，1=完全偏离） */
  deviation_score: number;
  /** 容忍阈值 */
  tolerance_threshold: number;
}

// ─── 创建认知节点请求 ───
export interface CreateCognitionRequest {
  content: string;
  source_task_id?: string;
  confidence: number;
  tags: string[];
  team_id: string;
  stage: CognitionStage;
  trigger_type?: CognitionTriggerType;
  /** 前序认知 ID（如果是演化） */
  evolved_from_id?: string;
  evolution_reason?: string;
}

// ─── 扩展的认知记录（含阶段信息） ───
export interface CognitionNodeExtended extends CognitionRecord {
  stage: CognitionStage;
  trigger_type?: CognitionTriggerType;
  vetoed: boolean;
  vetoed_by?: string;
  vetoed_at?: string;
}

// ─── 认知服务 ───
export class CognitionService {
  /** 偏差容忍阈值，超出此阈值自动触发认知写入 */
  private readonly deviationThreshold: number;

  /** 同类失败次数阈值 */
  private readonly repeatedFailureThreshold: number;

  constructor(
    private readonly neo4j: Neo4jSession,
    options?: { deviationThreshold?: number; repeatedFailureThreshold?: number },
  ) {
    this.deviationThreshold = options?.deviationThreshold ?? 0.3;
    this.repeatedFailureThreshold = options?.repeatedFailureThreshold ?? 3;
  }

  /**
   * 评估偏差并决定是否触发认知写入
   * 核心逻辑：偏差在容忍范围内 → 跳过；超出 → AI 直接写入认知节点
   */
  async evaluateDeviation(assessment: DeviationAssessment): Promise<CognitionNodeExtended | null> {
    if (assessment.deviation_score <= (assessment.tolerance_threshold || this.deviationThreshold)) {
      // 偏差在容忍范围内，不触发认知
      return null;
    }

    // 超出容忍范围，自动写入认知节点
    const content = `Deviation detected for task ${assessment.task_id}: ` +
      `expected ${JSON.stringify(assessment.expected)}, ` +
      `actual ${JSON.stringify(assessment.actual)}. ` +
      `Deviation score: ${assessment.deviation_score} (threshold: ${assessment.tolerance_threshold || this.deviationThreshold})`;

    // 查找任务的 team_id
    const taskResult = await this.neo4j.run(
      `MATCH (t:Task {id: $task_id})-[:BELONGS_TO]->(g:Goal)
       RETURN g.team_id AS team_id LIMIT 1`,
      { task_id: assessment.task_id },
    );
    const teamId = taskResult.records[0]?.get('team_id') as string ?? '';

    return this.createCognition({
      content,
      source_task_id: assessment.task_id,
      confidence: Math.min(assessment.deviation_score, 0.9), // 置信度与偏差成正比
      tags: ['auto_detected', 'deviation'],
      team_id: teamId,
      stage: 'hypothesis',
      trigger_type: 'hypothesis_invalidated',
    });
  }

  /**
   * 检查重复失败模式
   * 同类执行失败3次以上 → 写入认知节点
   */
  async checkRepeatedFailures(taskType: string, teamId: string): Promise<CognitionNodeExtended | null> {
    const result = await this.neo4j.run(
      `MATCH (t:Task {task_type: $task_type})
       WHERE t.state = 'failed'
       AND EXISTS { MATCH (t)-[:BELONGS_TO]->(:Goal {team_id: $team_id}) }
       RETURN count(t) AS failure_count`,
      { task_type: taskType, team_id: teamId },
    );

    const failureCount = result.records[0]?.get('failure_count');
    const count = typeof failureCount === 'object' ? failureCount.toNumber() : (failureCount as number);

    if (count < this.repeatedFailureThreshold) {
      return null;
    }

    return this.createCognition({
      content: `Repeated failure pattern detected: task type "${taskType}" has failed ${count} times. ` +
        `This exceeds the threshold of ${this.repeatedFailureThreshold} and may indicate a systematic issue.`,
      confidence: Math.min(0.5 + count * 0.1, 0.95),
      tags: ['auto_detected', 'repeated_failure', taskType],
      team_id: teamId,
      stage: 'hypothesis',
      trigger_type: 'repeated_failure',
    });
  }

  /**
   * AI 直接写入认知节点
   * 关键原则：AI直接写入，人工只有否决权
   */
  async createCognition(req: CreateCognitionRequest): Promise<CognitionNodeExtended> {
    const result = await this.neo4j.run(
      `CREATE (c:Cognition {
        id: randomUUID(),
        content: $content,
        source_task_id: $source_task_id,
        confidence: $confidence,
        tags: $tags,
        team_id: $team_id,
        stage: $stage,
        trigger_type: $trigger_type,
        verified: false,
        vetoed: false,
        reference_count: 0,
        created_at: datetime(),
        updated_at: datetime()
      }) RETURN c`,
      {
        content: req.content,
        source_task_id: req.source_task_id ?? null,
        confidence: req.confidence,
        tags: req.tags,
        team_id: req.team_id,
        stage: req.stage,
        trigger_type: req.trigger_type ?? null,
      },
    );

    const node = this.mapCognitionNode(result.records[0].get('c').properties);

    // 如果是演化关系，创建 EVOLVED_FROM 边
    if (req.evolved_from_id) {
      await this.neo4j.run(
        `MATCH (from:Cognition {id: $from_id}), (to:Cognition {id: $to_id})
         CREATE (to)-[:EVOLVED_FROM {
           reason: $reason,
           evolution_type: 'refinement',
           evolved_at: datetime()
         }]->(from)`,
        {
          from_id: req.evolved_from_id,
          to_id: node.cognition_id,
          reason: req.evolution_reason ?? 'Evolved from prior cognition',
        },
      );
    }

    return node;
  }

  /** 人工否决认知（删除或标记为 vetoed） */
  async vetoCognition(cognitionId: string, vetoedBy: string): Promise<void> {
    await this.neo4j.run(
      `MATCH (c:Cognition {id: $id})
       SET c.vetoed = true, c.vetoed_by = $vetoed_by, c.vetoed_at = datetime(), c.updated_at = datetime()`,
      { id: cognitionId, vetoed_by: vetoedBy },
    );
  }

  /** 更新认知阶段 */
  async updateStage(cognitionId: string, stage: CognitionStage): Promise<CognitionNodeExtended | null> {
    const result = await this.neo4j.run(
      `MATCH (c:Cognition {id: $id})
       SET c.stage = $stage, c.updated_at = datetime()
       ${stage === 'validated' ? ', c.verified = true' : ''}
       RETURN c`,
      { id: cognitionId, stage },
    );
    return result.records.length > 0 ? this.mapCognitionNode(result.records[0].get('c').properties) : null;
  }

  /** 获取认知节点详情 */
  async getById(cognitionId: string): Promise<CognitionNodeExtended | null> {
    const result = await this.neo4j.run(
      `MATCH (c:Cognition {id: $id}) RETURN c`,
      { id: cognitionId },
    );
    return result.records.length > 0 ? this.mapCognitionNode(result.records[0].get('c').properties) : null;
  }

  /** 获取认知演化链 */
  async getEvolutionChain(cognitionId: string): Promise<CognitionEvolution[]> {
    const result = await this.neo4j.run(
      `MATCH path = (start:Cognition {id: $id})-[:EVOLVED_FROM*]->(ancestor:Cognition)
       UNWIND relationships(path) AS rel
       WITH startNode(rel) AS fromNode, endNode(rel) AS toNode, rel
       RETURN fromNode.id AS from_id, toNode.id AS to_id,
              rel.reason AS reason, rel.evolution_type AS evolution_type,
              toString(rel.evolved_at) AS evolved_at
       ORDER BY rel.evolved_at ASC`,
      { id: cognitionId },
    );

    return result.records.map((r) => ({
      from_cognition_id: r.get('from_id') as string,
      to_cognition_id: r.get('to_id') as string,
      reason: r.get('reason') as string,
      evolution_type: r.get('evolution_type') as CognitionEvolution['evolution_type'],
      evolved_at: r.get('evolved_at') as string,
    }));
  }

  /** 列出团队的认知信号（含未否决的） */
  async listByTeam(teamId: string, includeVetoed: boolean = false): Promise<CognitionNodeExtended[]> {
    const vetoFilter = includeVetoed ? '' : 'AND c.vetoed = false';
    const result = await this.neo4j.run(
      `MATCH (c:Cognition {team_id: $team_id})
       WHERE true ${vetoFilter}
       RETURN c
       ORDER BY c.created_at DESC`,
      { team_id: teamId },
    );
    return result.records.map((r) => this.mapCognitionNode(r.get('c').properties));
  }

  /** 记录人工推翻意图的认知事件 */
  async recordIntentOverride(
    intentNodeId: string,
    overriddenBy: string,
    reason: string,
    teamId: string,
  ): Promise<CognitionNodeExtended> {
    return this.createCognition({
      content: `Intent node ${intentNodeId} was overridden by ${overriddenBy}. Reason: ${reason}`,
      confidence: 1.0,
      tags: ['intent_override', 'manual'],
      team_id: teamId,
      stage: 'validated',
      trigger_type: 'intent_overridden',
    });
  }

  private mapCognitionNode(props: Record<string, unknown>): CognitionNodeExtended {
    return {
      cognition_id: props.id as string,
      content: props.content as string,
      source_task_id: props.source_task_id as string | undefined,
      confidence: (props.confidence as number) ?? 0,
      tags: (props.tags as string[]) ?? [],
      team_id: props.team_id as string,
      created_at: props.created_at ? String(props.created_at) : '',
      verified: (props.verified as boolean) ?? false,
      verified_by: props.verified_by as string | undefined,
      reference_count: (props.reference_count as number) ?? 0,
      stage: (props.stage as CognitionStage) ?? 'hypothesis',
      trigger_type: props.trigger_type as CognitionTriggerType | undefined,
      vetoed: (props.vetoed as boolean) ?? false,
      vetoed_by: props.vetoed_by as string | undefined,
      vetoed_at: props.vetoed_at ? String(props.vetoed_at) : undefined,
    };
  }
}
