/**
 * 事件类型定义
 * 对应 contracts/event-schema.yaml
 */

// ─── 事件域 ───
export type EventDomain =
  | 'task'
  | 'agent'
  | 'workflow'
  | 'cognition'
  | 'artifact'
  | 'intent';

// ─── 具体事件类型 ───
export type TaskEventType =
  | 'task.created'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.blocked'
  | 'task.human_required'
  | 'task.retried';

export type AgentEventType =
  | 'agent.registered'
  | 'agent.heartbeat'
  | 'agent.disconnected'
  | 'agent.capability_updated';

export type WorkflowEventType =
  | 'workflow.started'
  | 'workflow.step_started'
  | 'workflow.step_completed'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.paused';

export type CognitionEventType =
  | 'cognition.signal_emitted'
  | 'cognition.pattern_detected'
  | 'cognition.decision_required'
  | 'cognition.knowledge_updated';

export type ArtifactEventType =
  | 'artifact.created'
  | 'artifact.updated'
  | 'artifact.archived';

export type IntentEventType =
  | 'intent.goal_created'
  | 'intent.graph_updated'
  | 'intent.decomposed';

export type EventType =
  | TaskEventType
  | AgentEventType
  | WorkflowEventType
  | CognitionEventType
  | ArtifactEventType
  | IntentEventType;

// ─── 事件来源 ───
export interface EventSource {
  /** 发出事件的服务名 */
  service: string;
  /** 触发事件的龙虾 ID */
  agent_id?: string;
  /** 触发事件的用户 ID */
  user_id?: string;
}

// ─── 事件元数据 ───
export interface EventMetadata {
  /** 事件 schema 版本 */
  schema_version?: string;
  /** 重试次数 */
  retry_count?: number;
  /** 事件过期时间（秒） */
  ttl?: number;
  [key: string]: unknown;
}

// ─── 标准事件结构 ───
export interface ClawTeamsEvent<T = Record<string, unknown>> {
  /** 事件唯一标识 */
  event_id: string;
  /** 事件类型 */
  event_type: EventType;
  /** 事件来源 */
  source: EventSource;
  /** 事件发生时间（ISO 8601） */
  timestamp: string;
  /** 关联 ID，用于追踪跨服务事件链 */
  correlation_id?: string;
  /** 因果 ID，指向直接触发此事件的上一个事件 */
  causation_id?: string;
  /** 事件载荷 */
  payload: T;
  /** 元数据 */
  metadata?: EventMetadata;
}

// ─── 事件订阅处理器 ───
export type EventHandler<T = Record<string, unknown>> = (
  event: ClawTeamsEvent<T>,
) => Promise<void>;

// ─── 事件总线接口 ───
export interface EventBus {
  /** 发布事件 */
  publish(event: ClawTeamsEvent): Promise<void>;
  /** 订阅事件 */
  subscribe(
    pattern: string,
    handler: EventHandler,
  ): Promise<{ unsubscribe: () => void }>;
}
