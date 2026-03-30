/**
 * 权限（Permissions）类型定义
 */

// ─── 资源类型 ───
export type ResourceType =
  | 'goal'
  | 'task'
  | 'workflow'
  | 'artifact'
  | 'agent'
  | 'team'
  | 'cognition'
  | 'knowledge';

// ─── 操作类型 ───
export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'execute'
  | 'assign'
  | 'admin';

// ─── 权限条目 ───
export interface Permission {
  /** 权限 ID */
  permission_id: string;
  /** 资源类型 */
  resource_type: ResourceType;
  /** 具体资源 ID（为 '*' 表示该类型下所有资源） */
  resource_id: string;
  /** 允许的操作列表 */
  actions: Action[];
}

// ─── 角色定义 ───
export interface Role {
  /** 角色 ID */
  role_id: string;
  /** 角色名称 */
  name: string;
  /** 角色描述 */
  description?: string;
  /** 角色拥有的权限列表 */
  permissions: Permission[];
  /** 是否为系统内置角色 */
  is_builtin: boolean;
  /** 所属团队 ID（系统角色为 null） */
  team_id?: string;
}

// ─── 预定义系统角色 ───
export const BUILTIN_ROLES = {
  /** 团队所有者，拥有所有权限 */
  TEAM_OWNER: 'team_owner',
  /** 团队管理员 */
  TEAM_ADMIN: 'team_admin',
  /** 团队成员（人类） */
  TEAM_MEMBER: 'team_member',
  /** 普通龙虾，只能执行分配的任务 */
  AGENT_WORKER: 'agent_worker',
  /** 高级龙虾，可以自主分配子任务 */
  AGENT_LEAD: 'agent_lead',
  /** 只读观察者 */
  VIEWER: 'viewer',
} as const;

export type BuiltinRoleName = (typeof BUILTIN_ROLES)[keyof typeof BUILTIN_ROLES];

// ─── 权限绑定（主体 + 角色 + 范围） ───
export interface PermissionBinding {
  /** 绑定 ID */
  binding_id: string;
  /** 主体类型 */
  subject_type: 'user' | 'agent';
  /** 主体 ID */
  subject_id: string;
  /** 角色 ID */
  role_id: string;
  /** 作用范围（团队 ID） */
  scope_team_id: string;
  /** 是否为手动例外（覆盖自动推导） */
  is_override: boolean;
  /** 授权人 */
  granted_by: string;
  /** 授权时间 */
  granted_at: string;
  /** 过期时间（null 表示永不过期） */
  expires_at?: string;
}

// ─── 权限检查请求 ───
export interface PermissionCheckRequest {
  /** 主体类型 */
  subject_type: 'user' | 'agent';
  /** 主体 ID */
  subject_id: string;
  /** 资源类型 */
  resource_type: ResourceType;
  /** 资源 ID */
  resource_id: string;
  /** 操作 */
  action: Action;
}

// ─── 权限检查结果 ───
export interface PermissionCheckResult {
  allowed: boolean;
  /** 拒绝原因（如果被拒绝） */
  reason?: string;
  /** 匹配的权限绑定 */
  matched_binding?: PermissionBinding;
}
