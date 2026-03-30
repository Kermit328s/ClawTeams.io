/**
 * 龙虾账号（Agent Identity）类型定义
 */

// ─── 龙虾能力声明 ───
export interface AgentCapability {
  /** 能力名称 */
  name: string;
  /** 能力版本 */
  version: string;
  /** 能力描述 */
  description?: string;
  /** 输入 schema */
  input_schema?: Record<string, unknown>;
  /** 输出 schema */
  output_schema?: Record<string, unknown>;
}

// ─── 龙虾运行时信息 ───
export interface AgentRuntime {
  /** 容器 ID */
  container_id?: string;
  /** 主机名 */
  hostname?: string;
  /** 平台 */
  platform?: string;
  /** 内存（MB） */
  memory_mb?: number;
  /** CPU 核数 */
  cpu_cores?: number;
}

// ─── 龙虾状态 ───
export type AgentStatus = 'online' | 'offline' | 'busy';

export type AgentHeartbeatStatus = 'idle' | 'busy' | 'overloaded' | 'shutting_down';

// ─── 龙虾资源使用 ───
export interface AgentResourceUsage {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
}

// ─── 龙虾账号 ───
export interface AgentIdentity {
  /** 龙虾唯一标识 */
  agent_id: string;
  /** 龙虾名称 */
  name: string;
  /** 所属团队 ID */
  team_id: string;
  /** 当前状态 */
  status: AgentStatus;
  /** 能力列表 */
  capabilities: AgentCapability[];
  /** 分配的角色列表 */
  roles: string[];
  /** 运行时信息 */
  runtime?: AgentRuntime;
  /** API Key 哈希（不存储明文） */
  api_key_hash: string;
  /** API Key 前缀（用于识别） */
  api_key_prefix: string;
  /** 创建时间 */
  created_at: string;
  /** 最后活跃时间 */
  last_active_at?: string;
}

// ─── 创建龙虾请求 ───
export interface CreateAgentRequest {
  name: string;
  team_id: string;
  capabilities: AgentCapability[];
}

// ─── 创建龙虾响应（包含明文 API Key，仅返回一次） ───
export interface CreateAgentResponse extends AgentIdentity {
  api_key: string;
}

// ─── 龙虾会话 ───
export interface AgentSession {
  session_id: string;
  agent_id: string;
  /** 会话建立时间 */
  connected_at: string;
  /** 最后心跳时间 */
  last_heartbeat_at: string;
  /** 当前正在执行的任务 */
  current_task_id?: string;
  /** 心跳状态 */
  heartbeat_status: AgentHeartbeatStatus;
}
