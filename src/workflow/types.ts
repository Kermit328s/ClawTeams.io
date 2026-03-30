/**
 * 工作流层内部类型定义
 * 在 infra/shared 之上扩展工作流特有的类型
 */

import type {
  IntentNodeType,
  IntentEdgeType,
  IntentSubGraph,
  Priority,
  AgentIdentity,
} from '../infra/shared';

// ─── 工作流 DAG 节点 ───
export interface WorkflowNode {
  /** 节点 ID（来自意图图谱） */
  id: string;
  /** 节点类型 */
  type: IntentNodeType;
  /** 节点标签/标题 */
  label: string;
  /** 所需能力（Task 节点必填） */
  required_capabilities?: string[];
  /** 任务类型（Task 节点） */
  task_type?: string;
  /** 优先级 */
  priority?: Priority;
  /** 截止时间 */
  deadline?: string;
  /** 决策选项（Decision 节点） */
  decision_options?: { id: string; label: string; target_node_id: string }[];
  /** 条件表达式（Decision 节点） */
  condition_expr?: string;
  /** 人工描述（Human 节点） */
  human_description?: string;
  /** 预估耗时（分钟） */
  estimated_duration_minutes?: number;
  /** 原始节点元数据 */
  metadata?: Record<string, unknown>;
}

// ─── 工作流 DAG 边 ───
export interface WorkflowEdge {
  /** 边 ID */
  id: string;
  /** 起始节点 */
  from_id: string;
  /** 目标节点 */
  to_id: string;
  /** 边类型 */
  edge_type: IntentEdgeType;
  /** 条件表达式（CONDITION 边） */
  condition_expr?: string;
  /** 权重 */
  weight?: number;
}

// ─── 工作流 DAG ───
export interface WorkflowDAG {
  /** 关联的目标 ID */
  goal_id: string;
  /** 图谱版本 */
  version: number;
  /** 所有节点 */
  nodes: WorkflowNode[];
  /** 所有边 */
  edges: WorkflowEdge[];
  /** 拓扑排序结果（可含回环时为尽量排序） */
  topological_order: string[];
  /** 关键路径节点 ID 列表 */
  critical_path: string[];
  /** 是否含有回环 */
  has_cycles: boolean;
  /** 检测到的回环路径 */
  cycles: string[][];
  /** 入度为 0 的起始节点 */
  entry_nodes: string[];
  /** 出度为 0 的终止节点 */
  exit_nodes: string[];
}

// ─── 执行计划 ───
export interface ExecutionPlan {
  /** 执行计划 ID */
  plan_id: string;
  /** 关联的目标 ID */
  goal_id: string;
  /** 工作流 ID */
  workflow_id: string;
  /** 执行步骤组（每组内可并行） */
  stages: ExecutionStage[];
  /** 风险评估 */
  risks: RiskAssessment[];
  /** 预估总耗时（分钟） */
  estimated_total_minutes: number;
  /** 生成时间 */
  created_at: string;
}

export interface ExecutionStage {
  /** 阶段序号 */
  stage_index: number;
  /** 此阶段中的任务分配 */
  assignments: TaskAssignment[];
  /** 此阶段可并行执行 */
  parallel: boolean;
  /** 此阶段预估耗时 */
  estimated_duration_minutes: number;
}

export interface TaskAssignment {
  /** 节点 ID */
  node_id: string;
  /** 分配的龙虾 ID */
  assigned_agent_id: string;
  /** 分配的龙虾名称 */
  assigned_agent_name: string;
  /** 匹配的能力 */
  matched_capabilities: string[];
  /** 匹配置信度 (0-1) */
  match_confidence: number;
  /** 是否为人工节点 */
  is_human: boolean;
}

export interface RiskAssessment {
  /** 风险类型 */
  type: 'bottleneck' | 'single_point_of_failure' | 'long_running' | 'no_capable_agent';
  /** 涉及节点 */
  node_ids: string[];
  /** 风险描述 */
  description: string;
  /** 严重级别 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 建议的缓解措施 */
  mitigation?: string;
}

// ─── Temporal 编译输出 ───
export interface CompiledWorkflow {
  /** 工作流名称 */
  workflow_name: string;
  /** 工作流 ID */
  workflow_id: string;
  /** Temporal 任务队列 */
  task_queue: string;
  /** 生成的工作流代码 */
  workflow_code: string;
  /** 生成的 Activity 定义代码 */
  activities_code: string;
  /** 生成的 Worker 注册代码 */
  worker_code: string;
  /** 信号定义（用于 Human 节点） */
  signal_definitions: SignalDefinition[];
  /** 编译时间 */
  compiled_at: string;
}

export interface SignalDefinition {
  /** 信号名称 */
  name: string;
  /** 关联的 Human 节点 ID */
  node_id: string;
  /** 描述 */
  description: string;
}

// ─── 变化监听 ───
export type ChangeLevel = 'minor' | 'moderate' | 'major';

export interface IntentChange {
  /** 变化 ID */
  change_id: string;
  /** 关联的目标 ID */
  goal_id: string;
  /** 变化等级 */
  level: ChangeLevel;
  /** 变化描述 */
  description: string;
  /** 新增的节点 */
  added_nodes: string[];
  /** 删除的节点 */
  removed_nodes: string[];
  /** 修改的节点 */
  modified_nodes: string[];
  /** 新增的边 */
  added_edges: string[];
  /** 删除的边 */
  removed_edges: string[];
  /** 接收时间 */
  received_at: string;
}

export interface ChangeBuffer {
  /** 缓冲区关联的目标 ID */
  goal_id: string;
  /** 缓冲的变化列表 */
  changes: IntentChange[];
  /** 缓冲开始时间 */
  buffer_start: string;
  /** 最后一次变化时间 */
  last_change_at: string;
  /** 合并后的最终变化等级 */
  merged_level: ChangeLevel;
}

// ─── AI 驱动 ───
export interface NaturalLanguageIntent {
  /** 用户原始输入 */
  raw_input: string;
  /** 上下文（团队信息等） */
  context: {
    team_id: string;
    user_id: string;
    existing_goals?: string[];
  };
}

export interface StructuredIntent {
  /** 解析后的意图图谱 */
  graph: IntentSubGraph;
  /** 解析置信度 */
  confidence: number;
  /** 解析说明 */
  explanation: string;
  /** 是否需要人工确认 */
  needs_confirmation: boolean;
}

// ─── AI 提供者接口 ───
export interface AIProvider {
  /** 将自然语言解析为结构化意图 */
  parseIntent(input: NaturalLanguageIntent): Promise<StructuredIntent>;
  /** 辅助生成执行计划 */
  suggestPlan(dag: WorkflowDAG, agents: AgentIdentity[]): Promise<ExecutionPlan>;
}

// ─── 检查点位置 ───
export type CheckpointPosition =
  | 'task_completed'
  | 'entering_wait'
  | 'before_human_approval'
  | 'milestone';
