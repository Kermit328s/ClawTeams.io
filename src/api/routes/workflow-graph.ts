// ============================================================
// 工作流图数据路由（Sprint 3 — React Flow 兼容）
// ============================================================

import { FastifyInstance } from 'fastify';
import { Database } from '../../store/database';
import { WorkflowBuilder } from '../../brain/workflow-builder';
import { MdParser } from '../../tracker/md-parser';

export function registerWorkflowGraphRoutes(app: FastifyInstance, db: Database): void {
  const mdParser = new MdParser();
  const workflowBuilder = new WorkflowBuilder(db, mdParser);

  /**
   * GET /api/v1/workspaces/:id/workflow-graph
   *
   * 返回完整的 WorkflowGraph，包含:
   * - nodes: React Flow 兼容节点（含 position、data）
   * - edges: React Flow 兼容边（含 type、animated、style）
   * - metadata: 生成时间、数据源统计
   */
  app.get('/api/v1/workspaces/:id/workflow-graph', async (request) => {
    const { id } = request.params as { id: string };
    const graph = workflowBuilder.buildGraph(id);
    return graph;
  });

  /**
   * GET /api/v1/workspaces/:id/workflow-graph/nodes
   * 只返回节点列表（轻量查询）
   */
  app.get('/api/v1/workspaces/:id/workflow-graph/nodes', async (request) => {
    const { id } = request.params as { id: string };
    const graph = workflowBuilder.buildGraph(id);
    return { nodes: graph.nodes };
  });

  /**
   * GET /api/v1/workspaces/:id/workflow-graph/edges
   * 只返回边列表（轻量查询）
   */
  app.get('/api/v1/workspaces/:id/workflow-graph/edges', async (request) => {
    const { id } = request.params as { id: string };
    const graph = workflowBuilder.buildGraph(id);
    return { edges: graph.edges };
  });

  /**
   * GET /api/v1/workspaces/:id/workflow-graph/metadata
   * 只返回元数据
   */
  app.get('/api/v1/workspaces/:id/workflow-graph/metadata', async (request) => {
    const { id } = request.params as { id: string };
    const graph = workflowBuilder.buildGraph(id);
    return { metadata: graph.metadata };
  });
}
