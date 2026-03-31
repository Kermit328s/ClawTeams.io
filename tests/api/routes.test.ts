// ============================================================
// API 路由测试 — 使用 Fastify inject（无需启动服务）
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { Database } from '../../src/store/database';
import { createApiServer } from '../../src/api/server';
import { FastifyInstance } from 'fastify';

const TEST_DB_PATH = path.join(__dirname, '..', '..', 'data', 'test-api.sqlite');

let app: FastifyInstance;
let db: Database;

beforeAll(async () => {
  // 清理旧的测试数据库
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  db = new Database(TEST_DB_PATH);
  app = await createApiServer({ port: 0, db });
});

afterAll(async () => {
  await app.close();
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

// ---- 健康检查 ----

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

// ---- 认证 ----

describe('Auth routes', () => {
  it('POST /api/v1/auth/register creates a user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'pass123', name: 'Test User' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user_id).toBeDefined();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
  });

  it('POST /api/v1/auth/register rejects duplicate email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'pass123', name: 'Test User' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/v1/auth/login with valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'pass123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user_id).toBeDefined();
    expect(body.token).toBeDefined();
  });

  it('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/login with unknown email returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'pass123' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/register requires email and password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'No Email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---- 工作空间 ----

describe('Workspace routes', () => {
  it('POST /api/v1/workspaces creates a workspace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      payload: { name: 'Test Workspace', owner_id: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Test Workspace');
    expect(body.id).toBeDefined();
  });

  it('GET /api/v1/workspaces lists workspaces', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/workspaces/:id returns workspace', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Test Workspace');
  });

  it('GET /api/v1/workspaces/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/999' });
    expect(res.statusCode).toBe(404);
  });
});

// ---- 龙虾 ----

describe('Claw routes', () => {
  beforeAll(() => {
    db.upsertClaw({
      claw_id: 'test-claw-001',
      name: 'Test Lobster',
      openclaw_dir: '/tmp/test-openclaw',
      gateway_port: 8080,
    });
    db.upsertAgent({
      agent_id: 'agent-invest',
      claw_id: 'test-claw-001',
      name: 'Invest Agent',
      emoji: '🦋',
      model: 'gpt-4',
    });
    db.upsertAgent({
      agent_id: 'agent-trigger',
      claw_id: 'test-claw-001',
      name: 'Trigger Agent',
      emoji: '⚡',
      model: 'gpt-4',
    });
  });

  it('GET /api/v1/claws/:id returns claw with agents', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/claws/test-claw-001' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.claw_id).toBe('test-claw-001');
    expect(body.agents).toBeDefined();
    expect(body.agents.length).toBe(2);
  });

  it('GET /api/v1/claws/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/claws/unknown' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/claws/:id/agents returns agent list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/claws/test-claw-001/agents' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].agent_id).toBeDefined();
  });
});

// ---- Agent 画像 ----

describe('Agent routes', () => {
  beforeAll(() => {
    // 添加核心文件
    db.upsertCoreFile({
      claw_id: 'test-claw-001',
      agent_id: 'agent-invest',
      file_type: 'identity',
      file_path: '/tmp/test/IDENTITY.md',
      current_hash: 'abc123',
      current_content: '- **Name:** Butterfly\n- **Creature:** strategy analyst\n- **Vibe:** sharp\n- **Emoji:** 🦋',
    });
    db.upsertCoreFile({
      claw_id: 'test-claw-001',
      agent_id: 'agent-invest',
      file_type: 'soul',
      file_path: '/tmp/test/SOUL.md',
      current_hash: 'def456',
      current_content: '# Soul\n**Be data-driven and evidence-based**\n## Boundaries\n- Never make financial guarantees',
    });

    // 添加执行记录
    db.insertExecutionFromHook({
      agent_id: 'agent-invest',
      claw_id: 'test-claw-001',
      run_id: 'run-001',
      status: 'completed',
      duration_ms: 5000,
      token_input: 100,
      token_output: 200,
      token_total: 300,
      has_tool_calls: false,
      timestamp: Date.now(),
    });

    // 添加协作关系
    db.upsertAgentRelation({
      source_agent_id: 'agent-invest',
      target_agent_id: 'agent-trigger',
      relation_type: 'collaboration',
      source_info: 'Receives signals',
    });
  });

  it('GET /api/v1/agents/:id returns full profile', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/agent-invest' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.agent_id).toBe('agent-invest');
    expect(body.name).toBe('Invest Agent');
    expect(body.emoji).toBe('🦋');
    expect(body.identity).not.toBeNull();
    expect(body.identity.name).toBe('Butterfly');
    expect(body.identity.emoji).toBe('🦋');
    expect(body.soul).not.toBeNull();
    expect(body.soul.principles.length).toBeGreaterThan(0);
    expect(body.core_files.length).toBeGreaterThanOrEqual(2);
    expect(body.execution_stats).toBeDefined();
    expect(body.execution_stats.today).toBeDefined();
    expect(body.execution_stats.week).toBeDefined();
    expect(body.relations.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/agents/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/unknown' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/agents/:id/core-files returns file list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/agent-invest/core-files' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/v1/agents/:id/core-files/:type returns parsed content', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/agent-invest/core-files/identity' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.file_type).toBe('identity');
    expect(body.current_content).toContain('Butterfly');
    expect(body.parsed).not.toBeNull();
    expect(body.parsed.name).toBe('Butterfly');
  });

  it('GET /api/v1/agents/:id/core-files/:type returns 404 for unknown type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/agent-invest/core-files/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

// ---- 执行记录 ----

describe('Execution routes', () => {
  it('GET /api/v1/workspaces/:id/executions returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1/executions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/v1/workspaces/:id/executions supports agent_id filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/1/executions?agent_id=agent-invest',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    for (const exec of body) {
      expect(exec.agent_id).toBe('agent-invest');
    }
  });

  it('GET /api/v1/executions/:id returns detail with parsed tool_calls', async () => {
    // 先找一个执行 ID
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1/executions' });
    const list = JSON.parse(listRes.payload);
    if (list.length === 0) return; // 跳过如果没有执行记录

    const execId = list[0].id;
    const res = await app.inject({ method: 'GET', url: `/api/v1/executions/${execId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(execId);
    expect(Array.isArray(body.tool_calls)).toBe(true);
  });

  it('GET /api/v1/executions/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/executions/99999' });
    expect(res.statusCode).toBe(404);
  });
});

// ---- 档案 ----

describe('Artifact routes', () => {
  it('GET /api/v1/workspaces/:id/artifacts returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1/artifacts' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/v1/artifacts/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/artifacts/99999' });
    expect(res.statusCode).toBe(404);
  });
});

// ---- 工作流图 ----

describe('Workflow graph routes', () => {
  it('GET /api/v1/workspaces/:id/workflow-graph returns nodes and edges', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1/workflow-graph' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.nodes).toBeDefined();
    expect(body.edges).toBeDefined();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    // 应该有我们之前创建的 agent 节点
    expect(body.nodes.length).toBeGreaterThanOrEqual(2);
  });
});

// ---- 活动日志 ----

describe('Activity routes', () => {
  it('GET /api/v1/workspaces/:id/activity returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1/activity' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/v1/workspaces/:id/activity supports limit param', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1/activity?limit=5' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/v1/workspaces/:id/activity supports type filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/1/activity?types=execution' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    for (const item of body) {
      expect(item.type).toMatch(/^execution\./);
    }
  });
});
