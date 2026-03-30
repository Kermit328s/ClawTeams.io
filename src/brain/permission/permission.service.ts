/**
 * 权限模块服务
 * - 基于负责范围的自动推导引擎
 * - 层次锁定机制（愿景层最严 → 执行层最松）
 * - 权限校验
 */

import type { Pool } from 'pg';
import type { Session as Neo4jSession } from 'neo4j-driver';
import type {
  PermissionCheckRequest,
  PermissionCheckResult,
  PermissionBinding,
  Permission,
  Action,
  ResourceType,
} from '../../infra/shared';
import type { IntentLayer } from '../intent/graph.service';

// ─── 层次锁定级别 ───
export interface LayerLockConfig {
  /** 意图层级 */
  layer: IntentLayer;
  /** 修改时是否需要二次确认 */
  requires_confirmation: boolean;
  /** 修改时是否需要明确表达意图 */
  requires_explicit_intent: boolean;
  /** 允许的操作列表 */
  allowed_actions: Action[];
}

// ─── 默认层次锁定配置 ───
const DEFAULT_LAYER_LOCKS: LayerLockConfig[] = [
  {
    layer: 'vision',
    requires_confirmation: true,
    requires_explicit_intent: true,
    allowed_actions: ['read'], // 默认只读，修改需要最高权限+二次确认
  },
  {
    layer: 'strategy',
    requires_confirmation: true,
    requires_explicit_intent: true,
    allowed_actions: ['read', 'update'],
  },
  {
    layer: 'phase_plan',
    requires_confirmation: false,
    requires_explicit_intent: false,
    allowed_actions: ['create', 'read', 'update', 'delete'],
  },
  {
    layer: 'action_item',
    requires_confirmation: false,
    requires_explicit_intent: false,
    allowed_actions: ['create', 'read', 'update', 'delete', 'execute', 'assign'],
  },
];

// ─── 自动推导结果 ───
export interface DerivedPermissions {
  /** 负责范围内的权限 */
  scope_permissions: Permission[];
  /** 上层只读权限 */
  upper_layer_permissions: Permission[];
  /** 平级有限只读权限 */
  peer_permissions: Permission[];
  /** 下层完整管理权限 */
  lower_layer_permissions: Permission[];
}

// ─── 权限校验选项 ───
export interface PermissionCheckOptions {
  /** 是否已完成二次确认 */
  confirmed?: boolean;
  /** 是否已明确表达修改意图 */
  explicit_intent?: boolean;
  /** 目标节点所在的意图层级 */
  target_layer?: IntentLayer;
}

// ─── Neo4j label 白名单 ───
const ALLOWED_NEO4J_LABELS: ReadonlySet<string> = new Set(['User', 'Agent']);

function validateNeo4jLabel(label: string): void {
  if (!ALLOWED_NEO4J_LABELS.has(label)) {
    throw new Error(`Invalid Neo4j label: ${label}. Allowed labels: ${[...ALLOWED_NEO4J_LABELS].join(', ')}`);
  }
}

// ─── 权限服务 ───
export class PermissionService {
  private layerLocks: LayerLockConfig[];

  constructor(
    private readonly pg: Pool,
    private readonly neo4j: Neo4jSession,
    layerLocks?: LayerLockConfig[],
  ) {
    this.layerLocks = layerLocks ?? DEFAULT_LAYER_LOCKS;
  }

  /**
   * 权限校验
   * 综合考虑：角色权限 + 负责范围自动推导 + 层次锁定
   */
  async checkPermission(
    req: PermissionCheckRequest,
    options?: PermissionCheckOptions,
  ): Promise<PermissionCheckResult> {
    // 1. 检查层次锁定
    if (options?.target_layer) {
      const lockResult = this.checkLayerLock(options.target_layer, req.action, options);
      if (!lockResult.allowed) {
        return lockResult;
      }
    }

    // 2. 查询用户/龙虾的所有有效权限绑定
    const bindings = await this.getActiveBindings(req.subject_type, req.subject_id);

    // 3. 逐一匹配
    for (const binding of bindings) {
      const role = await this.getRole(binding.role_id);
      if (!role) continue;

      for (const perm of role.permissions) {
        if (this.matchesPermission(perm, req.resource_type, req.resource_id, req.action)) {
          return {
            allowed: true,
            matched_binding: binding,
          };
        }
      }
    }

    // 4. 自动推导权限（基于负责范围）
    const derived = await this.derivePermissions(req.subject_type, req.subject_id);
    const allDerived = [
      ...derived.scope_permissions,
      ...derived.upper_layer_permissions,
      ...derived.peer_permissions,
      ...derived.lower_layer_permissions,
    ];

    for (const perm of allDerived) {
      if (this.matchesPermission(perm, req.resource_type, req.resource_id, req.action)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `No permission for ${req.action} on ${req.resource_type}:${req.resource_id}`,
    };
  }

  /**
   * 自动推导权限
   * 基于 Neo4j 中的 RESPONSIBLE_FOR 关系推导
   */
  async derivePermissions(subjectType: 'user' | 'agent', subjectId: string): Promise<DerivedPermissions> {
    const result: DerivedPermissions = {
      scope_permissions: [],
      upper_layer_permissions: [],
      peer_permissions: [],
      lower_layer_permissions: [],
    };

    // 查找负责的目标节点
    const label = subjectType === 'user' ? 'User' : 'Agent';
    validateNeo4jLabel(label);
    const responsibleResult = await this.neo4j.run(
      `MATCH (s:${label} {id: $id})-[:RESPONSIBLE_FOR]->(g:Goal)
       RETURN g.id AS goal_id, g.layer AS layer, g.team_id AS team_id`,
      { id: subjectId },
    );

    for (const record of responsibleResult.records) {
      const goalId = record.get('goal_id') as string;
      const layer = record.get('layer') as IntentLayer;

      // 对负责范围：完整读写权限
      result.scope_permissions.push({
        permission_id: `derived:${subjectId}:${goalId}:scope`,
        resource_type: 'goal',
        resource_id: goalId,
        actions: ['create', 'read', 'update', 'delete', 'execute', 'assign'],
      });

      // 对下层：完整管理权限
      const childResult = await this.neo4j.run(
        `MATCH (child:Goal)-[:BELONGS_TO*]->(g:Goal {id: $id})
         RETURN child.id AS child_id`,
        { id: goalId },
      );
      for (const childRecord of childResult.records) {
        const childId = childRecord.get('child_id') as string;
        result.lower_layer_permissions.push({
          permission_id: `derived:${subjectId}:${childId}:lower`,
          resource_type: 'goal',
          resource_id: childId,
          actions: ['create', 'read', 'update', 'delete', 'execute', 'assign'],
        });
      }

      // 对上层：只读权限
      const parentResult = await this.neo4j.run(
        `MATCH (g:Goal {id: $id})-[:BELONGS_TO*]->(parent:Goal)
         RETURN parent.id AS parent_id`,
        { id: goalId },
      );
      for (const parentRecord of parentResult.records) {
        const parentId = parentRecord.get('parent_id') as string;
        result.upper_layer_permissions.push({
          permission_id: `derived:${subjectId}:${parentId}:upper`,
          resource_type: 'goal',
          resource_id: parentId,
          actions: ['read'],
        });
      }
    }

    return result;
  }

  /** 创建权限绑定 */
  async createBinding(binding: Omit<PermissionBinding, 'binding_id' | 'granted_at'>): Promise<PermissionBinding> {
    const result = await this.pg.query(
      `INSERT INTO permission_bindings (subject_type, subject_id, role_id, scope_team_id, is_override, granted_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, subject_type, subject_id, role_id, scope_team_id, is_override, granted_by, granted_at, expires_at`,
      [
        binding.subject_type,
        binding.subject_id,
        binding.role_id,
        binding.scope_team_id,
        binding.is_override,
        binding.granted_by,
        binding.expires_at ?? null,
      ],
    );
    return this.mapBinding(result.rows[0]);
  }

  /** 撤销权限绑定 */
  async revokeBinding(bindingId: string): Promise<void> {
    await this.pg.query(
      `DELETE FROM permission_bindings WHERE id = $1`,
      [bindingId],
    );
  }

  /** 获取主体的所有权限绑定 */
  async getActiveBindings(subjectType: 'user' | 'agent', subjectId: string): Promise<PermissionBinding[]> {
    const result = await this.pg.query(
      `SELECT id, subject_type, subject_id, role_id, scope_team_id, is_override, granted_by, granted_at, expires_at
       FROM permission_bindings
       WHERE subject_type = $1 AND subject_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [subjectType, subjectId],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapBinding(row));
  }

  /** 层次锁定检查 */
  private checkLayerLock(
    layer: IntentLayer,
    action: Action,
    options?: PermissionCheckOptions,
  ): PermissionCheckResult {
    const lock = this.layerLocks.find((l) => l.layer === layer);
    if (!lock) {
      return { allowed: true };
    }

    // 检查操作是否在允许列表中
    if (!lock.allowed_actions.includes(action)) {
      // 写操作可能需要额外确认
      if (lock.requires_confirmation && !options?.confirmed) {
        return {
          allowed: false,
          reason: `Layer "${layer}" requires confirmation for "${action}" action`,
        };
      }
      if (lock.requires_explicit_intent && !options?.explicit_intent) {
        return {
          allowed: false,
          reason: `Layer "${layer}" requires explicit intent declaration for "${action}" action`,
        };
      }
    }

    return { allowed: true };
  }

  /** 获取角色定义 */
  private async getRole(roleId: string): Promise<{ permissions: Permission[] } | null> {
    const result = await this.pg.query(
      `SELECT permissions FROM roles WHERE id = $1`,
      [roleId],
    );
    if (result.rows.length === 0) return null;

    const perms = result.rows[0].permissions;
    const permissions: Permission[] = (Array.isArray(perms) ? perms : JSON.parse(perms as string)).map(
      (p: Record<string, unknown>, i: number) => ({
        permission_id: `role:${roleId}:${i}`,
        resource_type: p.resource_type as ResourceType,
        resource_id: p.resource_id as string,
        actions: p.actions as Action[],
      }),
    );

    return { permissions };
  }

  /** 权限匹配 */
  private matchesPermission(
    perm: Permission,
    resourceType: ResourceType,
    resourceId: string,
    action: Action,
  ): boolean {
    const typeMatch = perm.resource_type === '*' || perm.resource_type === resourceType;
    const idMatch = perm.resource_id === '*' || perm.resource_id === resourceId;
    const actionMatch = perm.actions.includes(action) || perm.actions.includes('admin' as Action);
    return typeMatch && idMatch && actionMatch;
  }

  private mapBinding(row: Record<string, unknown>): PermissionBinding {
    return {
      binding_id: row.id as string,
      subject_type: row.subject_type as 'user' | 'agent',
      subject_id: row.subject_id as string,
      role_id: row.role_id as string,
      scope_team_id: row.scope_team_id as string,
      is_override: row.is_override as boolean,
      granted_by: row.granted_by as string,
      granted_at: row.granted_at instanceof Date ? row.granted_at.toISOString() : (row.granted_at as string),
      expires_at: row.expires_at
        ? (row.expires_at instanceof Date ? row.expires_at.toISOString() : (row.expires_at as string))
        : undefined,
    };
  }
}
