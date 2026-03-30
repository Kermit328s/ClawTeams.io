/**
 * 任务输入（TaskInput）类型定义
 * 定义龙虾接收任务时的标准输入格式
 */

import type { Priority } from './intent-graph';
import type { CognitiveSignal } from './cognition';

// ─── 结构化输出 ───
export type ResultType = 'json' | 'table' | 'reference' | 'composite';

export interface StructuredResult {
  /** 输出类型 */
  type: ResultType;
  /** 结构化数据体 */
  data: unknown;
  /** 结果摘要 */
  summary?: string;
  /** 自评质量分（0-1） */
  quality_score?: number;
}

// ─── 上下文快照引用 ───
export interface ContextSnapshot {
  /** 快照唯一标识 */
  snapshot_id: string;
  /** 执行时意图图谱的版本号 */
  intent_graph_version?: number;
  /** 所属目标节点 ID */
  parent_goal_id?: string;
  /** 执行环境变量快照 */
  environment?: Record<string, unknown>;
}

// ─── 最小状态单元（StateUnit） ───
export interface StateUnit {
  /** 任务唯一标识 */
  task_id: string;
  /** 执行龙虾 ID */
  agent_id: string;
  /** 任务最终状态 */
  state: 'completed' | 'failed' | 'blocked' | 'human_required';
  /** 结构化输出 */
  result: StructuredResult;
  /** 产出档案 ID 列表 */
  artifact_ids: string[];
  /** 认知信号 */
  cognitive_signal?: CognitiveSignal;
  /** 上下文快照引用 */
  context_snapshot?: ContextSnapshot;
  /** 完成时间（ISO 8601） */
  timestamp: string;
  /** 版本号 */
  version: number;
  /** 上游依赖任务 ID 列表 */
  upstream_task_ids: string[];
  /** 下游待触发任务 ID 列表 */
  downstream_task_ids: string[];
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

// ─── 任务输入 ───
export interface TaskInput {
  /** 任务 ID */
  task_id: string;
  /** 任务类型 */
  task_type: string;
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description?: string;
  /** 优先级 */
  priority: Priority;
  /** 截止时间 */
  deadline?: string;
  /** 输入参数（任务类型特定） */
  parameters: Record<string, unknown>;
  /** 上游任务的状态单元（依赖的前置任务输出） */
  upstream_state_units: StateUnit[];
  /** 关联的档案 ID 列表（可供读取） */
  available_artifact_ids: string[];
  /** 上下文信息 */
  context: TaskContext;
}

// ─── 任务上下文 ───
export interface TaskContext {
  /** 所属目标 ID */
  goal_id: string;
  /** 所属工作流 ID */
  workflow_id: string;
  /** 团队 ID */
  team_id: string;
  /** 意图图谱版本号 */
  intent_graph_version: number;
  /** 当前任务在 DAG 中的位置信息 */
  dag_position: {
    /** 当前深度 */
    depth: number;
    /** 同层并行任务数 */
    parallel_count: number;
    /** 是否为叶子节点 */
    is_leaf: boolean;
  };
  /** 额外上下文 */
  extra?: Record<string, unknown>;
}
