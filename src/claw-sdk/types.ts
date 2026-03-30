/**
 * ClawSDK 公开类型定义
 * 龙虾端 SDK 使用的所有类型
 */

// ─── 消息类型（与服务端协议一致） ───
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

// ─── 消息帧（与服务端协议一致） ───
export interface MessageFrame<T = unknown> {
  msg_type: MessageType;
  msg_id: string;
  timestamp: string;
  reply_to?: string;
  payload: T;
}

// ─── 龙虾能力声明 ───
export interface AgentCapability {
  name: string;
  version: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

// ─── 龙虾运行时信息 ───
export interface AgentRuntime {
  container_id?: string;
  hostname?: string;
  platform?: string;
  memory_mb?: number;
  cpu_cores?: number;
}

// ─── 心跳状态 ───
export type AgentHeartbeatStatus = 'idle' | 'busy' | 'overloaded' | 'shutting_down';

// ─── 资源使用 ───
export interface AgentResourceUsage {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
}

// ─── 任务状态 ───
export type TaskReportState =
  | 'accepted'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'human_required';

// ─── 任务分配（服务端推送） ───
export interface TaskAssignment {
  task_id: string;
  task_type: string;
  input: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  deadline: string;
  context?: Record<string, unknown>;
}

// ─── 事件结构 ───
export interface ClawTeamsEvent {
  event_id: string;
  event_type: string;
  source: {
    service: string;
    agent_id?: string;
    user_id?: string;
  };
  timestamp: string;
  correlation_id?: string;
  causation_id?: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ─── SDK 配置 ───
export interface ClawSDKConfig {
  /** 大脑 WebSocket 地址 */
  serverUrl: string;
  /** 龙虾 ID */
  agentId: string;
  /** API Key */
  apiKey: string;
  /** 能力声明 */
  capabilities: AgentCapability[];
  /** 运行时信息（可选，SDK 自动采集部分信息） */
  runtime?: AgentRuntime;
  /** 心跳间隔（ms），默认 30000 */
  heartbeatIntervalMs?: number;
  /** 自动重连，默认 true */
  autoReconnect?: boolean;
  /** 重连退避配置 */
  reconnect?: {
    initialMs?: number;
    maxMs?: number;
    multiplier?: number;
  };
}

// ─── 连接状态 ───
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'registered'
  | 'reconnecting';

// ─── 事件回调类型 ───
export type TaskHandler = (task: TaskAssignment) => Promise<void>;
export type EventHandler = (event: ClawTeamsEvent) => Promise<void>;
export type StateChangeHandler = (state: ConnectionState) => void;
