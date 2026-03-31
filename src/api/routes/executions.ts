// ============================================================
// 任务执行记录路由
// ============================================================

import { FastifyInstance } from 'fastify';
import { Database } from '../../store/database';

export function registerExecutionsRoutes(app: FastifyInstance, db: Database): void {
  // 执行列表（支持筛选）
  app.get('/api/v1/workspaces/:id/executions', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      agent_id?: string;
      status?: string;
      date_from?: string;
      date_to?: string;
      limit?: string;
      offset?: string;
    };

    return db.getExecutionsFiltered({
      workspace_id: id,
      agent_id: query.agent_id,
      status: query.status,
      date_from: query.date_from,
      date_to: query.date_to,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  });

  // 执行详情（含工具调用、产出）
  app.get('/api/v1/executions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const execution = db.getExecutionById(Number(id)) as {
      id: number;
      tool_calls: string;
      artifact_ids: string;
    } | undefined;

    if (!execution) {
      return reply.status(404).send({ error: 'execution not found' });
    }

    // 解析 JSON 字段
    return {
      ...execution,
      tool_calls: safeJsonParse(execution.tool_calls, []),
      artifact_ids: safeJsonParse(execution.artifact_ids, []),
    };
  });
}

function safeJsonParse(value: string | null | undefined, fallback: unknown): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
