/**
 * 权限校验中间件
 * Fastify hook，在路由处理前校验权限
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Action, ResourceType } from '../../infra/shared';
import type { PermissionService } from './permission.service';
import type { IntentLayer } from '../intent/graph.service';

// ─── 中间件配置 ───
export interface PermissionGuardOptions {
  /** 目标资源类型 */
  resource_type: ResourceType;
  /** 需要的操作 */
  action: Action;
  /** 从请求中提取资源 ID 的函数（默认从 params.id 取） */
  extractResourceId?: (req: FastifyRequest) => string;
  /** 目标意图层级（用于层次锁定检查） */
  target_layer?: IntentLayer;
  /** 是否需要二次确认（从请求 header 读取） */
  check_confirmation?: boolean;
}

/**
 * 创建权限守卫 Hook
 */
export function createPermissionGuard(
  permissionService: PermissionService,
  options: PermissionGuardOptions,
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = request.authContext;
    if (!auth) {
      return reply.status(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }

    const resourceId = options.extractResourceId
      ? options.extractResourceId(request)
      : ((request.params as Record<string, string>)?.id ?? '*');

    const checkResult = await permissionService.checkPermission(
      {
        subject_type: auth.subject_type,
        subject_id: auth.subject_id,
        resource_type: options.resource_type,
        resource_id: resourceId,
        action: options.action,
      },
      {
        target_layer: options.target_layer,
        confirmed: options.check_confirmation
          ? request.headers['x-confirm-action'] === 'true'
          : undefined,
        explicit_intent: request.headers['x-explicit-intent'] === 'true' || undefined,
      },
    );

    if (!checkResult.allowed) {
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: checkResult.reason ?? 'Permission denied',
      });
    }
  };
}

/**
 * 快捷守卫：要求 team_owner 或 team_admin 角色
 */
export function requireAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = request.authContext;
    if (!auth) {
      return reply.status(401).send({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    const roles = auth.roles ?? [];
    if (!roles.includes('team_owner') && !roles.includes('team_admin')) {
      return reply.status(403).send({ code: 'FORBIDDEN', message: 'Admin role required' });
    }
  };
}

/**
 * 快捷守卫：要求属于指定团队
 */
export function requireTeamMembership() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = request.authContext;
    if (!auth) {
      return reply.status(401).send({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    const teamId = (request.params as Record<string, string>)?.team_id
      ?? (request.query as Record<string, string>)?.team_id
      ?? auth.team_id;

    if (!teamId) {
      return reply.status(400).send({ code: 'MISSING_TEAM_ID', message: 'Team ID is required' });
    }

    if (auth.team_id && auth.team_id !== teamId) {
      return reply.status(403).send({ code: 'FORBIDDEN', message: 'Not a member of this team' });
    }
  };
}
