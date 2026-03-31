// ============================================================
// 产出档案路由
// ============================================================

import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import { Database } from '../../store/database';

export function registerArtifactsRoutes(app: FastifyInstance, db: Database): void {
  // 档案列表（支持筛选）
  app.get('/api/v1/workspaces/:id/artifacts', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      agent_id?: string;
      type?: string;
      date_from?: string;
      date_to?: string;
      limit?: string;
      offset?: string;
    };

    return db.getArtifactsFiltered({
      workspace_id: id,
      agent_id: query.agent_id,
      type: query.type,
      date_from: query.date_from,
      date_to: query.date_to,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  });

  // 档案详情
  app.get('/api/v1/artifacts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = db.getArtifactById(Number(id));

    if (!artifact) {
      return reply.status(404).send({ error: 'artifact not found' });
    }

    return artifact;
  });

  // 档案内容
  app.get('/api/v1/artifacts/:id/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = db.getArtifactById(Number(id)) as {
      id: number;
      file_path: string;
      file_size: number;
      type: string;
    } | undefined;

    if (!artifact) {
      return reply.status(404).send({ error: 'artifact not found' });
    }

    if (!artifact.file_path) {
      return reply.status(404).send({ error: 'artifact has no file path' });
    }

    // 小文本文件直接返回内容
    const MAX_INLINE_SIZE = 1024 * 1024; // 1MB
    if (artifact.file_size && artifact.file_size > MAX_INLINE_SIZE) {
      return { type: 'path', file_path: artifact.file_path };
    }

    try {
      const content = fs.readFileSync(artifact.file_path, 'utf-8');
      return { type: 'inline', content, file_path: artifact.file_path };
    } catch {
      return { type: 'path', file_path: artifact.file_path, error: 'file not readable' };
    }
  });
}
