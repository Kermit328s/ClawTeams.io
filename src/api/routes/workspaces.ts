// ============================================================
// 工作空间路由
// ============================================================

import { FastifyInstance } from 'fastify';
import { Database } from '../../store/database';

export function registerWorkspacesRoutes(app: FastifyInstance, db: Database): void {
  // 创建工作空间
  app.post('/api/v1/workspaces', async (request, reply) => {
    const { name, owner_id } = request.body as { name: string; owner_id?: number };

    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const { id } = db.createWorkspace({ name, owner_id: owner_id ?? 0 });
    const workspace = db.getWorkspaceById(id);

    return workspace;
  });

  // 列出工作空间
  app.get('/api/v1/workspaces', async () => {
    const workspaces = db.getWorkspaces();
    // Map DB `id` to `workspace_id` that the frontend expects
    return workspaces.map((ws: any) => ({
      ...ws,
      workspace_id: String(ws.id),
    }));
  });

  // 工作空间详情
  app.get('/api/v1/workspaces/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = db.getWorkspaceById(Number(id)) as any;

    if (!workspace) {
      return reply.status(404).send({ error: 'workspace not found' });
    }

    return { ...workspace, workspace_id: String(workspace.id) };
  });
}
