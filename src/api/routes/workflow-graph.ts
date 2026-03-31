// ============================================================
// 工作流图数据路由
// ============================================================

import { FastifyInstance } from 'fastify';
import { Database } from '../../store/database';
import { WorkflowBuilder } from '../../brain/workflow-builder';
import { MdParser } from '../../tracker/md-parser';

export function registerWorkflowGraphRoutes(app: FastifyInstance, db: Database): void {
  const mdParser = new MdParser();
  const workflowBuilder = new WorkflowBuilder(db, mdParser);

  // 工作流图数据
  app.get('/api/v1/workspaces/:id/workflow-graph', async (request) => {
    const { id } = request.params as { id: string };
    return workflowBuilder.buildGraph(id);
  });
}
