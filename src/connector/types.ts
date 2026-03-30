/**
 * 连接层内部类型定义
 * 补充 protocol-spec.yaml 中定义的消息类型
 */

import type {
  ClawTeamsEvent,
  EventType,
  AgentCapability,
  AgentRuntime,
  AgentHeartbeatStatus,
  AgentResourceUsage,
} from '../infra/shared';

// ─── 消息帧 ───
export interface MessageFrame<T = unknown> {
  /** 消息类型 */
  msg_type: MessageType;
  /** 消息唯一标识 */
  msg_id: string;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 回复的消息 ID（请求-响应模式） */
  reply_to?: string;
  /** 消息载荷 */
  payload: T;
}

export type MessageType =
  | 'agent.register'
  | 'agent.register_ack'
  | 'agent.heartbeat'
  | 'agent.heartbeat_ack'
  | 'task.assign'
  | 'task.report'
  | 'event.subscribe'
  | 'event.subscribe_ack'
  | 'event.push'
  | 'error';

// ─── 注册消息 ───
export interface AgentRegisterPayload {
  agent_id: string;
  api_key: string;
  capabilities: AgentCapability[];
  runtime: AgentRuntime;
}

export interface AgentRegisterAckPayload {
  success: boolean;
  session_id: string;
  assigned_roles?: string[];
  error?: string;
}

// ─── 心跳消息 ───
export interface AgentHeartbeatPayload {
  agent_id: string;
  session_id: string;
  status: AgentHeartbeatStatus;
  current_task_id?: string;
  resource_usage?: AgentResourceUsage;
}

export interface AgentHeartbeatAckPayload {
  received: boolean;
  server_time: string;
}

// ─── 任务下发 ───
export interface TaskAssignPayload {
  task_id: string;
  task_type: string;
  input: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  deadline: string;
  context?: Record<string, unknown>;
}

// ─── 状态上报 ───
export type TaskReportState =
  | 'accepted'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'human_required';

export interface TaskReportPayload {
  task_id: string;
  agent_id: string;
  state: TaskReportState;
  progress_percent?: number;
  state_unit?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// ─── 事件订阅 ───
export interface EventSubscribePayload {
  agent_id: string;
  event_patterns: string[];
}

export interface EventSubscribeAckPayload {
  subscribed_patterns: string[];
}

export interface EventPushPayload {
  event: ClawTeamsEvent;
}

// ─── 错误消息 ───
export type ProtocolErrorCode =
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMITED'
  | 'TASK_NOT_FOUND'
  | 'CAPABILITY_MISMATCH'
  | 'INTERNAL_ERROR';

export interface ErrorPayload {
  code: ProtocolErrorCode;
  message: string;
}

// ─── 连接信息 ───
export interface AgentConnection {
  agent_id: string;
  session_id: string;
  connected_at: string;
  last_heartbeat_at: string;
  heartbeat_status: AgentHeartbeatStatus;
  current_task_id?: string;
  subscribed_patterns: string[];
}

// ─── 事件持久化接口 ───
export interface EventStore {
  /** 写入事件到持久化存储 */
  append(event: ClawTeamsEvent): Promise<void>;
  /** 查询事件（按过滤条件） */
  query(filter: EventQueryFilter): Promise<ClawTeamsEvent[]>;
}

export interface EventQueryFilter {
  event_type?: EventType | string;
  source_agent_id?: string;
  correlation_id?: string;
  from_time?: string;
  to_time?: string;
  limit?: number;
}

// ─── 龙虾三层信息同步 ───
export interface AgentSkillLayer {
  agent_id: string;
  system_prompt?: string;
  tools: string[];
  parameters: Record<string, unknown>;
  capabilities: AgentCapability[];
  updated_at: string;
}

export interface AgentEnvironmentLayer {
  agent_id: string;
  container_image?: string;
  dependencies: Record<string, string>;
  env_vars: Record<string, string>;
  updated_at: string;
}

export interface AgentDataContextLayer {
  agent_id: string;
  execution_history_ids: string[];
  business_data_refs: string[];
  team_id: string;
  updated_at: string;
}

export interface AgentThreeLayers {
  skill: AgentSkillLayer;
  environment: AgentEnvironmentLayer;
  data_context: AgentDataContextLayer;
}

// ─── 离线缓存队列项 ───
export interface OfflineQueueItem {
  id: string;
  message: MessageFrame;
  queued_at: string;
  retry_count: number;
}
