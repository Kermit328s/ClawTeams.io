// ============================================================
// ClawTeams OpenClaw Plugin — 消息类型定义
// 与 src/server/types.ts 保持一致，但独立定义
// （Plugin 是独立 npm 包，不能引用主项目）
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
