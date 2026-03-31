// ============================================================
// ClawTeams 前端类型定义
// ============================================================

// ---- Agent 状态 ----

export type AgentStatus = 'idle' | 'running' | 'failed';
export type ClawStatus = 'online' | 'offline';
export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'timeout';
export type ExecutionTrigger = 'user' | 'cron' | 'heartbeat' | 'subagent' | 'unknown';
export type ArtifactType = 'document' | 'code' | 'data' | 'media' | 'config';
export type EdgeType = 'internal' | 'cross_agent' | 'crosscut' | 'collaboration' | 'subagent' | 'data_flow' | 'sequence';
export type CoreFileType = 'soul' | 'identity' | 'agents' | 'tools' | 'user' | 'heartbeat';

// ---- Claw ----

export interface Claw {
  claw_id: string;
  name: string;
  status: ClawStatus;
  gateway_port: number;
  last_heartbeat: string;
  registered_at: string;
  agents: Agent[];
}

// ---- Agent ----

export interface Agent {
  agent_id: string;
  claw_id: string;
  name: string;
  emoji: string;
  model: string;
  status: AgentStatus;
  current_task?: string;
  last_active_at?: string;
  // Parsed profile fields (from detail API)
  role?: string;
  creature?: string;
  vibe?: string;
  capabilities?: string[];
  has_file_change?: boolean;
}

// ---- Workflow Graph (React Flow compatible) — 技能级 ----

export interface SkillNodeData {
  [key: string]: unknown;
  skill_id: string;
  agent_id: string;
  agent_emoji: string;
  agent_name: string;
  skill_name: string;
  skill_icon: string;
  skill_index: number;
  skill_total: number;
  status: 'idle' | 'running' | 'completed';
  is_crosscut: boolean;
  agent_color: string;
  latest_artifact?: {
    name: string;
    type: string;
    preview: string;
    timestamp: string;
  };
  execution_stats: {
    total: number;
    succeeded: number;
    failed: number;
    tokens: number;
  };
}

export interface AgentGroupData {
  [key: string]: unknown;
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  agent_color: string;
  is_crosscut: boolean;
  skill_count: number;
}

export interface WorkflowNode {
  id: string;
  type: 'skill' | 'agent-group';
  position: { x: number; y: number };
  data: SkillNodeData | AgentGroupData;
  parentId?: string;
  style?: Record<string, unknown>;
}

/** Legacy alias for backward compatibility */
export type WorkflowNodeData = SkillNodeData;

export interface WorkflowEdgeData {
  [key: string]: unknown;
  label?: string;
  strength?: number;
  source_info?: string;
  last_transfer?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  data: WorkflowEdgeData;
  animated?: boolean;
  style?: Record<string, unknown>;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: {
    generated_at: number;
    static_edge_count: number;
    dynamic_edge_count: number;
    data_sources: string[];
  };
}

// ---- Execution ----

export interface Execution {
  id: number;
  execution_id: string;
  agent_id: string;
  claw_id: string;
  session_id: string;
  trigger: ExecutionTrigger;
  status: ExecutionStatus;
  input_preview: string;
  output_preview: string;
  error_message?: string;
  token_input?: number;
  token_output?: number;
  token_total?: number;
  tool_calls?: { name: string; input_preview: string; output_preview: string }[];
  artifact_ids?: string[];
  parent_execution_id?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

// ---- Artifact ----

export interface Artifact {
  id: number;
  artifact_id: string;
  execution_id?: string;
  agent_id: string;
  claw_id: string;
  workspace_id: string;
  type: ArtifactType;
  file_path: string;
  file_hash: string;
  file_size: number;
  version: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

// ---- Activity Log ----

export interface ActivityEntry {
  id: string;
  timestamp: string;
  emoji: string;
  status: string;
  message: string;
  agent_id?: string;
  type: 'execution' | 'file_change' | 'claw_status' | 'subagent';
  is_new?: boolean;
}

// ---- WebSocket Events ----

export type FrontendEventType =
  | 'claw.status'
  | 'agent.status'
  | 'execution.new'
  | 'execution.update'
  | 'subagent.spawned'
  | 'subagent.ended'
  | 'file.changed';

export interface FrontendEvent {
  type: FrontendEventType;
  payload: unknown;
  timestamp: number;
}

// ---- View Types ----

export type ViewType = 'topology' | 'timeline' | 'grid' | 'artifact';

// ---- Detail Panel ----

export interface DetailTarget {
  type: 'agent' | 'claw';
  id: string;
}

// ---- API Response Wrappers ----

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface Workspace {
  workspace_id: string;
  id?: number;
  name: string;
  claws?: Claw[];
}
