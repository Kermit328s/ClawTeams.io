// ============================================================
// ClawTeams 文件追踪服务 — 类型定义
// ============================================================

// ---- 龙虾（Claw）注册 ----

export interface ClawRegistration {
  claw_id: string;
  gateway_port: number;
  model_default: string;
  model_fallbacks: string[];
  agents: AgentRegistration[];
  channels: string[];
}

export interface AgentRegistration {
  agent_id: string;
  name: string;
  emoji: string;
  theme: string;
  model: string;
  workspace_path: string;
}

// ---- Agent 核心文件解析结果 ----

export interface AgentIdentity {
  name: string;
  creature: string;
  vibe: string;
  emoji: string;
  avatar?: string;
}

export interface AgentSoul {
  principles: string[];
  boundaries: {
    can_do: string[];
    must_ask: string[];
    never_do: string[];
  };
  personality: string;
  raw_content: string;
}

export interface AgentWorkProtocol {
  boot_sequence: string[];
  permission_zones: {
    internal_safe: string[];
    external_sensitive: string[];
    group_rules: string[];
  };
  memory_config: {
    daily_log: string;
    long_term: string;
    heartbeat_state: string;
  };
  scheduling: {
    heartbeat_purpose: string;
    cron_purpose: string;
  };
}

export interface AgentTools {
  configurations: {
    category: string;
    items: Record<string, string>[];
  }[];
  raw_content: string;
}

export interface UserProfile {
  name: string;
  call_them: string;
  pronouns: string;
  timezone: string;
  notes: string;
  context: string;
}

export interface HeartbeatConfig {
  tasks: { description: string; frequency?: string }[];
  is_empty: boolean;
}

// ---- 半结构化 md 解析结果 ----

export interface AgentNetwork {
  agents: {
    agent_id: string;
    role: string;
    responsibilities: string[];
    outputs: string[];
    not_responsible: string[];
  }[];
  workflow_chain: {
    type: 'sequential' | 'parallel' | 'crosscut';
    nodes: string[];
  }[];
  edges: {
    from: string;
    to: string;
    relation: string;
  }[];
}

export interface SystemOverview {
  architecture: { orchestrator: string; agents: string[] };
  cadence: {
    agent_id: string;
    daily: string;
    weekly: string;
    biweekly: string;
  }[];
  business_chain: string;
  growth_chain: string;
  redteam_severity: {
    level: string;
    meaning: string;
    action: string;
    auto_continue: boolean;
  }[];
}

export interface BusinessSchema {
  objects: {
    name: string;
    purpose: string;
    fields: { name: string; type: string; description: string; enum_values?: string[] }[];
    owner_agent?: string;
  }[];
  object_chain: string[];
  crosscut_objects: string[];
}

export interface StateMachine {
  entity: string;
  states: { name: string; description: string }[];
  transitions: {
    from: string;
    to: string;
    condition: string;
    trigger_agent?: string;
  }[];
  terminal_states: string[];
}

export interface AgentWorkDefinition {
  agent_id: string;
  core_duties: string[];
  sources: { tier: string; items: string[]; rules?: string[] }[];
  admission_criteria: string[];
  output_objects: { name: string; upgrade_path?: string; threshold?: string[] }[];
  scoring: { dimension: string; levels: string[] }[];
  cadence: { frequency: string; work: string; goal: string }[];
  hard_boundaries: string[];
}

// 技能链摘要（用于节点展示）
export interface SkillChainSummary {
  role_positioning: string;        // 一句话角色定位
  core_duties: string[];           // 核心职责（最多4条）
  input_sources: string[];         // 输入来源（简要）
  output_objects: string[];        // 输出对象名
  delivers_to: string[];           // 交付给谁（agent_id 或角色名）
  receives_from: string[];         // 从谁接收
  hard_boundaries: string[];       // 硬性边界
}

export interface RedteamGovernance {
  first_principle: string;
  authority: { has: string; not_has: string };
  severity_levels: { level: string; meaning: string; action: string; auto_continue: boolean }[];
  engagement_modes: { mode: string; description: string }[];
}

// ---- 记忆系统 ----

export interface MemorySystem {
  database_path: string;
  size_bytes: number;
  last_modified: Date;
}

// ---- 文件快照和变更 ----

export type CoreFileType = 'soul' | 'identity' | 'agents' | 'tools' | 'user' | 'heartbeat';

export type TrackedFileCategory =
  | 'config'         // openclaw.json
  | 'device'         // identity/device.json
  | 'core'           // 6 种核心 md 文件
  | 'workspace'      // 工作空间中的其他 md 文件
  | 'session'        // 会话 JSONL
  | 'memory'         // SQLite 数据库
  | 'work_doc';      // Agent 工作定义等文档

export interface FileSnapshot {
  file_path: string;          // 相对于 openclaw 目录的路径
  absolute_path: string;      // 绝对路径
  category: TrackedFileCategory;
  hash: string;               // SHA-256
  size: number;               // 字节
  mtime: Date;                // 最后修改时间
  agent_id?: string;          // 关联的 agent（如有）
  core_file_type?: CoreFileType; // 核心文件类型（如适用）
}

export type ChangeType = 'added' | 'modified' | 'deleted';

export interface FileChange {
  file_path: string;
  absolute_path: string;
  category: TrackedFileCategory;
  change_type: ChangeType;
  old_hash?: string;
  new_hash?: string;
  old_size?: number;
  new_size?: number;
  agent_id?: string;
  core_file_type?: CoreFileType;
  content?: string;           // 新内容（核心文件）或增量内容（会话文件）
  diff?: string;              // 与上一版本的 diff
  detected_at: Date;
}

// ---- 会话解析 ----

export interface SessionHeader {
  type: 'session';
  version: number;
  id: string;
  timestamp: string;
  cwd?: string;
}

export interface SessionMessage {
  type: 'message';
  id: string;
  parentId?: string | null;
  timestamp: string;
  message: {
    role: 'user' | 'assistant';
    content: string | { type: string; text?: string }[];
    timestamp?: number;
  };
}

export interface SessionModelChange {
  type: 'model_change';
  id: string;
  parentId?: string | null;
  timestamp: string;
  provider: string;
  modelId: string;
}

export interface SessionCustomEvent {
  type: 'custom';
  customType: string;
  data: Record<string, unknown>;
  id: string;
  parentId?: string | null;
  timestamp: string;
}

export interface SessionThinkingLevelChange {
  type: 'thinking_level_change';
  id: string;
  parentId?: string | null;
  timestamp: string;
  thinkingLevel: string;
}

export type SessionEntry =
  | SessionHeader
  | SessionMessage
  | SessionModelChange
  | SessionCustomEvent
  | SessionThinkingLevelChange
  | { type: string; [key: string]: unknown };

export interface TaskEvent {
  session_id: string;
  agent_id: string;
  run_id?: string;
  trigger: 'user' | 'cron' | 'heartbeat' | 'subagent' | 'unknown';
  status: 'running' | 'completed' | 'failed' | 'timeout';
  input_preview: string;
  output_preview: string;
  token_input?: number;
  token_output?: number;
  token_total?: number;
  tool_calls: { name: string; input_preview: string; output_preview: string }[];
  started_at: Date;
  completed_at?: Date;
  duration_ms?: number;
}

// ---- 解析结果联合类型 ----

export type ParsedFileType =
  | 'identity'
  | 'soul'
  | 'agents_protocol'
  | 'tools'
  | 'user'
  | 'heartbeat'
  | 'config'
  | 'agent_network'
  | 'system_overview'
  | 'business_schema'
  | 'state_machine'
  | 'work_definition'
  | 'redteam_governance'
  | 'unknown';

export interface ParsedFile {
  type: ParsedFileType;
  data: unknown;
  file_path: string;
  raw_content: string;
}
