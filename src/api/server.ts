// ============================================================
// ClawTeams HTTP API 服务 — Fastify
// ============================================================

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Database } from '../store/database';
import { registerAuthRoutes } from './routes/auth';
import { registerWorkspacesRoutes } from './routes/workspaces';
import { registerClawsRoutes } from './routes/claws';
import { registerAgentsRoutes } from './routes/agents';
import { registerExecutionsRoutes } from './routes/executions';
import { registerArtifactsRoutes } from './routes/artifacts';
import { registerWorkflowGraphRoutes } from './routes/workflow-graph';
import { registerActivityRoutes } from './routes/activity';

export interface ApiServerOptions {
  port: number;
  db: Database;
}

export async function createApiServer(options: ApiServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors);

  // 注入 db 到所有路由
  app.decorate('db', options.db);

  // 注册所有路由
  registerAuthRoutes(app, options.db);
  registerWorkspacesRoutes(app, options.db);
  registerClawsRoutes(app, options.db);
  registerAgentsRoutes(app, options.db);
  registerExecutionsRoutes(app, options.db);
  registerArtifactsRoutes(app, options.db);
  registerWorkflowGraphRoutes(app, options.db);
  registerActivityRoutes(app, options.db);

  // 健康检查
  app.get('/api/v1/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
