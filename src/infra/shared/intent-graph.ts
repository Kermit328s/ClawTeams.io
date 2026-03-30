/**
 * 意图图谱（Intent Graph）节点/边类型定义
 * 对应 Neo4j 中的图结构
 */

// ─── 节点类型枚举 ───
export type IntentNodeType =
  | 'Goal'
  | 'Task'
  | 'Decision'
  | 'Human'
  | 'Cognition'
  | 'Agent'
  | 'User'
  | 'Team'
  | 'Role';

// ─── 边类型枚举 ───
export type IntentEdgeType =
  | 'DEPENDS_ON'
  | 'PARALLEL_WITH'
  | 'CONDITION'
  | 'AGGREGATES'
  | 'LOOP_BACK'
  | 'BELONGS_TO'
  | 'OWNS'
  | 'RESPONSIBLE_FOR'
  | 'RELATES_TO'
  | 'EVOLVED_FROM';

// ─── 目标状态 ───
export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';

// ─── 任务状态 ───
export type TaskState =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'human_required'
  | 'cancelled';

// ─── 优先级 ───
export type Priority = 'critical' | 'high' | 'medium' | 'low';

// ─── 基础节点 ───
export interface BaseNode {
  /** 节点唯一标识 */
  id: string;
  /** 节点类型 */
  type: IntentNodeType;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
  /** 扩展属性 */
  metadata?: Record<string, unknown>;
}

// ─── 目标节点 ───
export interface GoalNode extends BaseNode {
  type: 'Goal';
  title: string;
  description?: string;
  status: GoalStatus;
  priority: Priority;
  team_id: string;
  deadline?: string;
}

// ─── 任务节点 ───
export interface TaskNode extends BaseNode {
  type: 'Task';
  title: string;
  task_type: string;
  state: TaskState;
  assigned_agent_id?: string;
  workflow_id?: string;
  priority: Priority;
  deadline?: string;
}

// ─── 决策节点 ───
export interface DecisionNode extends BaseNode {
  type: 'Decision';
  question: string;
  options: DecisionOption[];
  chosen_option?: string;
  decided_by?: string;
  decided_at?: string;
}

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  consequences?: string;
}

// ─── 人工节点 ───
export interface HumanNode extends BaseNode {
  type: 'Human';
  title: string;
  description: string;
  required_by_task_id: string;
  assigned_user_id?: string;
  resolved: boolean;
  resolution?: string;
}

// ─── 认知节点 ───
export interface CognitionNode extends BaseNode {
  type: 'Cognition';
  content: string;
  source_task_id?: string;
  confidence: number;
  tags: string[];
}

// ─── 图的边 ───
export interface GraphEdge {
  /** 边唯一标识 */
  id: string;
  /** 起始节点 ID */
  from_id: string;
  /** 目标节点 ID */
  to_id: string;
  /** 边类型 */
  edge_type: IntentEdgeType;
  /** 条件表达式（CONDITION 边使用） */
  condition_expr?: string;
  /** 权重 */
  weight?: number;
  /** 创建时间 */
  created_at: string;
  /** 扩展属性 */
  metadata?: Record<string, unknown>;
}

// ─── 意图子图（目标分解后的 DAG） ───
export interface IntentSubGraph {
  goal_id: string;
  nodes: BaseNode[];
  edges: GraphEdge[];
  version: number;
}

// ─── 聚合类型 ───
export type IntentNode =
  | GoalNode
  | TaskNode
  | DecisionNode
  | HumanNode
  | CognitionNode;
