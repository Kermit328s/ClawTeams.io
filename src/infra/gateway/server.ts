/**
 * API 网关 — Fastify 基础骨架
 */

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { jwtAuthHook } from './jwt-auth';
import { apiKeyAuthHook } from './api-key-auth';

// ─── 网关配置 ───
export interface GatewayConfig {
  /** 监听端口 */
  port: number;
  /** 监听地址 */
  host: string;
  /** JWT 密钥 */
  jwtSecret: string;
  /** 日志级别 */
  logLevel?: string;
  /** CORS 来源 */
  corsOrigin?: string | string[];
  /** PostgreSQL 连接（用于 API Key 验证） */
  pgConnectionString: string;
}

// ─── 请求上下文扩展（鉴权后注入） ───
export interface AuthContext {
  /** 认证类型 */
  auth_type: 'jwt' | 'api_key';
  /** 主体类型 */
  subject_type: 'user' | 'agent';
  /** 主体 ID */
  subject_id: string;
  /** 团队 ID */
  team_id?: string;
  /** 角色列表 */
  roles?: string[];
}

// Fastify 类型扩展
declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

// ─── 创建网关实例 ───
export async function createGateway(config: GatewayConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel ?? 'info',
    },
    requestTimeout: 30000,
  });

  // ─── CORS ───
  await app.register(import('@fastify/cors'), {
    origin: config.corsOrigin ?? '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-API-Key', 'X-Request-ID'],
    credentials: true,
  });

  // ─── 请求 ID ───
  app.addHook('onRequest', async (request: FastifyRequest) => {
    if (!request.headers['x-request-id']) {
      request.headers['x-request-id'] = crypto.randomUUID();
    }
  });

  // ─── 健康检查（无需鉴权） ───
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/ready', async () => {
    // 可扩展：检查数据库连接等
    return { status: 'ready', timestamp: new Date().toISOString() };
  });

  // ─── 注册鉴权路由前缀 ───

  // 人类用户路由（JWT 鉴权）
  app.register(
    async (userRoutes) => {
      userRoutes.addHook('onRequest', jwtAuthHook(config.jwtSecret));

      // 示例路由：获取当前用户信息
      userRoutes.get('/me', async (request: FastifyRequest) => {
        return {
          subject_id: request.authContext?.subject_id,
          subject_type: request.authContext?.subject_type,
          team_id: request.authContext?.team_id,
        };
      });

      // 这里将由各业务模块注册具体路由
    },
    { prefix: '/api/v1' },
  );

  // 龙虾路由（API Key 鉴权）
  app.register(
    async (agentRoutes) => {
      agentRoutes.addHook('onRequest', apiKeyAuthHook(config.pgConnectionString));

      // 示例路由：龙虾身份确认
      agentRoutes.get('/identity', async (request: FastifyRequest) => {
        return {
          agent_id: request.authContext?.subject_id,
          auth_type: request.authContext?.auth_type,
        };
      });

      // 这里将由各业务模块注册具体路由
    },
    { prefix: '/agent/v1' },
  );

  // ─── 全局错误处理 ───
  app.setErrorHandler(
    async (error: Error & { statusCode?: number }, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;

      app.log.error({ err: error }, 'Request error');

      return reply.status(statusCode).send({
        code: error.name ?? 'INTERNAL_ERROR',
        message:
          statusCode >= 500 ? 'Internal server error' : error.message,
      });
    },
  );

  // ─── 404 处理 ───
  app.setNotFoundHandler(async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
    });
  });

  return app;
}

// ─── 启动网关 ───
export async function startGateway(config: GatewayConfig): Promise<FastifyInstance> {
  const app = await createGateway(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Gateway listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  return app;
}
