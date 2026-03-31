// ============================================================
// 龙虾管理路由
// ============================================================

import { FastifyInstance } from 'fastify';
import { Database } from '../../store/database';

export function registerClawsRoutes(app: FastifyInstance, db: Database): void {
  // 列出工作空间下的龙虾
  app.get('/api/v1/workspaces/:id/claws', async (request) => {
    const { id } = request.params as { id: string };
    // 阶段一简化：返回所有龙虾（或按 workspace_id 筛选）
    const claws = db.getClawsByWorkspaceId(id);
    // 如果没有 workspace_id 关联的龙虾，返回所有
    if (claws.length === 0) {
      return db.getAllClaws();
    }
    return claws;
  });

  // 龙虾详情（含 agent 列表）
  app.get('/api/v1/claws/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const claw = db.getClawById(id);

    if (!claw) {
      return reply.status(404).send({ error: 'claw not found' });
    }

    const agents = db.getAgentsByClawId(id);

    return {
      ...(claw as object),
      agents,
    };
  });

  // Agent 列表及状态
  app.get('/api/v1/claws/:id/agents', async (request) => {
    const { id } = request.params as { id: string };
    return db.getAgentsByClawId(id);
  });
}
