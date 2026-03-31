// ============================================================
// Agent 路由 — 最重要的路由，返回 Agent 画像
// ============================================================

import { FastifyInstance } from 'fastify';
import { Database } from '../../store/database';
import { AgentProfileBuilder } from '../../brain/agent-profile';
import { MdParser } from '../../tracker/md-parser';

export function registerAgentsRoutes(app: FastifyInstance, db: Database): void {
  const mdParser = new MdParser();
  const profileBuilder = new AgentProfileBuilder(db, mdParser);

  // Agent 完整画像
  app.get('/api/v1/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = db.getAgentProfile(id) as {
      agent_id: string;
      claw_id: string;
      name: string;
      emoji: string;
      model: string;
      status: string;
      last_active_at: string;
    } | undefined;

    if (!agent) {
      return reply.status(404).send({ error: 'agent not found' });
    }

    const profile = profileBuilder.buildProfile(agent.agent_id, agent.claw_id);
    return profile;
  });

  // Agent 核心文件列表
  app.get('/api/v1/agents/:id/core-files', async (request) => {
    const { id } = request.params as { id: string };
    const coreFiles = db.getCoreFilesByAgentId(id);
    return coreFiles;
  });

  // 获取核心文件内容 + 解析结果
  app.get('/api/v1/agents/:id/core-files/:type', async (request, reply) => {
    const { id, type } = request.params as { id: string; type: string };
    const coreFile = db.getCoreFileContent(id, type) as {
      id: number;
      file_path: string;
      current_content: string | null;
      file_type: string;
      current_hash: string;
      version_count: number;
      last_changed_at: string;
    } | undefined;

    if (!coreFile) {
      return reply.status(404).send({ error: 'core file not found' });
    }

    // 解析 md 内容
    let parsed: unknown = null;
    if (coreFile.current_content) {
      const result = mdParser.autoDetectAndParse(coreFile.file_path, coreFile.current_content);
      parsed = result.data;
    }

    return {
      ...coreFile,
      parsed,
    };
  });

  // 文件版本历史（含 diff）
  app.get('/api/v1/agents/:id/core-files/:type/versions', async (request, reply) => {
    const { id, type } = request.params as { id: string; type: string };
    const coreFile = db.getCoreFileContent(id, type) as {
      id: number;
      file_path: string;
    } | undefined;

    if (!coreFile) {
      return reply.status(404).send({ error: 'core file not found' });
    }

    const versions = db.getFileVersionsByPath(coreFile.file_path);
    return versions;
  });
}
