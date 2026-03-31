// ============================================================
// 活动日志流路由
// ============================================================

import { FastifyInstance } from 'fastify';
import { Database } from '../../store/database';

export function registerActivityRoutes(app: FastifyInstance, db: Database): void {
  // 活动事件列表
  app.get('/api/v1/workspaces/:id/activity', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      limit?: string;
      offset?: string;
      types?: string;  // 逗号分隔的事件类型
    };

    const types = query.types ? query.types.split(',').map(t => t.trim()) : undefined;

    return db.getActivityLog({
      workspace_id: id,
      types,
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : 0,
    });
  });
}
