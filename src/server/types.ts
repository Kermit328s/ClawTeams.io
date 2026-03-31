// ============================================================
// ClawTeams WebSocket 服务 — 类型定义
// ============================================================

// ---- 龙虾 → ClawTeams 的 Hook 消息类型 ----

export type HookMessageType =
  | 'claw_online'        // 龙虾上线
  | 'claw_offline'       // 龙虾离线
  | 'agent_execution'    // Agent 完成执行
  | 'subagent_spawned'   // 子 Agent 生成
  | 'subagent_ended';    // 子 Agent 完成

// ---- 各消息的 payload 类型 ----

export interface ClawOnlinePayload {
  claw_id: string;
  timestamp: number;
}

export interface ClawOfflinePayload {
  claw_id: string;
  timestamp: number;
}

export interface AgentExecutionPayload {
  claw_id: string;
  agent_id: string;
  run_id: string;
  duration_ms?: number;
  status: 'completed' | 'failed';
  token_usage?: { input?: number; output?: number; total?: number };
  has_tool_calls: boolean;
  timestamp: number;
}

export interface SubagentSpawnedPayload {
  claw_id: string;
  parent_key: string;
  child_key: string;
  task: string;
  timestamp: number;
}

export interface SubagentEndedPayload {
  claw_id: string;
  child_key: string;
  outcome: string;
  timestamp: number;
}

// ---- 统一消息格式 ----

export type HookPayload =
  | ClawOnlinePayload
  | ClawOfflinePayload
  | AgentExecutionPayload
  | SubagentSpawnedPayload
  | SubagentEndedPayload;

export interface HookMessage {
  type: HookMessageType;
  payload: HookPayload;
}

// ---- ClawTeams → 前端的推送事件 ----

export type FrontendEventType =
  | 'claw.status'           // 龙虾在线状态变化
  | 'agent.status'          // Agent 状态变化
  | 'execution.new'         // 新的执行记录
  | 'execution.update'      // 执行状态更新
  | 'subagent.spawned'      // Subagent 协作
  | 'subagent.ended'        // Subagent 完成
  | 'file.changed';         // 文件版本变更（来自 tracker）

export interface FrontendEvent {
  type: FrontendEventType;
  payload: unknown;
  timestamp: number;
}

// ---- Hook 消息类型列表（用于验证） ----

export const VALID_HOOK_TYPES: HookMessageType[] = [
  'claw_online',
  'claw_offline',
  'agent_execution',
  'subagent_spawned',
  'subagent_ended',
];
