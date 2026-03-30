/**
 * 认知（Cognition）类型定义
 * 认知层用于系统的自我学习、模式识别和知识沉淀
 */

// ─── 认知信号类型 ───
export type CognitiveSignalType =
  | 'anomaly'
  | 'pattern_detected'
  | 'decision_required'
  | 'knowledge_update'
  | 'quality_alert';

// ─── 认知信号 ───
export interface CognitiveSignal {
  /** 是否触发认知层判断 */
  triggered: boolean;
  /** 信号类型 */
  signal_type?: CognitiveSignalType;
  /** 信号携带的数据 */
  payload?: Record<string, unknown>;
}

// ─── 认知节点（存储在 Neo4j 中） ───
export interface CognitionRecord {
  /** 认知节点 ID */
  cognition_id: string;
  /** 认知内容 */
  content: string;
  /** 来源任务 ID */
  source_task_id?: string;
  /** 置信度（0-1） */
  confidence: number;
  /** 标签 */
  tags: string[];
  /** 关联的团队 ID */
  team_id: string;
  /** 创建时间 */
  created_at: string;
  /** 是否已验证 */
  verified: boolean;
  /** 验证者 */
  verified_by?: string;
  /** 引用次数（被后续任务参考的次数） */
  reference_count: number;
}

// ─── 认知演化关系（EVOLVED_FROM 边的属性） ───
export interface CognitionEvolution {
  /** 前序认知节点 ID */
  from_cognition_id: string;
  /** 后续认知节点 ID */
  to_cognition_id: string;
  /** 演化原因 */
  reason: string;
  /** 演化类型 */
  evolution_type: 'refinement' | 'correction' | 'extension' | 'contradiction';
  /** 演化时间 */
  evolved_at: string;
}

// ─── 模式检测结果 ───
export interface PatternDetection {
  /** 检测 ID */
  detection_id: string;
  /** 模式描述 */
  pattern_description: string;
  /** 涉及的任务 ID 列表 */
  involved_task_ids: string[];
  /** 置信度 */
  confidence: number;
  /** 建议的行动 */
  suggested_action?: string;
  /** 检测时间 */
  detected_at: string;
}

// ─── 质量评估 ───
export interface QualityAssessment {
  /** 评估 ID */
  assessment_id: string;
  /** 被评估的任务 ID */
  task_id: string;
  /** 质量分（0-1） */
  score: number;
  /** 评估维度 */
  dimensions: QualityDimension[];
  /** 评估时间 */
  assessed_at: string;
}

export interface QualityDimension {
  /** 维度名称 */
  name: string;
  /** 维度分数（0-1） */
  score: number;
  /** 说明 */
  comment?: string;
}
