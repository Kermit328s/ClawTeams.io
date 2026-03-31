// ============================================================
// ClawTeams 端到端测试：完整链路
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';
import { FastifyInstance } from 'fastify';
import { Database } from '../../src/store/database';
import { WsServer } from '../../src/server/ws-server';
import { createApiServer } from '../../src/api/server';
import { FileTracker } from '../../src/tracker/file-tracker';

const TEMP_DB = `/tmp/clawteams-e2e-test-${Date.now()}.db`;
const TEMP_DIR = `/tmp/clawteams-e2e-openclaw-${Date.now()}`;
const TEST_CLAW_ID = 'test-claw-e2e';

describe('端到端：完整链路', () => {
  let db: Database;
  let wsServer: WsServer;
  let apiServer: FastifyInstance;
  let wsPort: number;

  // 辅助：创建模拟 .openclaw 目录结构
  function createMockOpenclawDir(): void {
    // 创建目录结构
    fs.mkdirSync(path.join(TEMP_DIR, 'agents', 'butterfly-invest', 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(TEMP_DIR, 'agents', 'butterfly-invest-trigger', 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(TEMP_DIR, 'identity'), { recursive: true });

    // openclaw.json
    const config = {
      gateway: { port: 8080 },
      agents: {
        defaults: { model: { primary: 'claude-3.5-sonnet' } },
        list: [
          {
            id: 'butterfly-invest',
            name: 'Butterfly',
            identity: { emoji: '\u{1F98B}', theme: 'invest' },
            workspace: './agents/butterfly-invest/workspace',
          },
          {
            id: 'butterfly-invest-trigger',
            name: 'Trigger',
            identity: { emoji: '\u26A1', theme: 'invest' },
            workspace: './agents/butterfly-invest-trigger/workspace',
          },
        ],
      },
      channels: {},
    };
    fs.writeFileSync(path.join(TEMP_DIR, 'openclaw.json'), JSON.stringify(config, null, 2));

    // device.json
    fs.writeFileSync(
      path.join(TEMP_DIR, 'identity', 'device.json'),
      JSON.stringify({ deviceId: TEST_CLAW_ID }),
    );

    // IDENTITY.md for butterfly-invest
    fs.writeFileSync(
      path.join(TEMP_DIR, 'agents', 'butterfly-invest', 'IDENTITY.md'),
      [
        '# Identity',
        '',
        '- **Name:** Butterfly',
        '- **Creature:** Lobster',
        '- **Vibe:** Strategic analyst',
        '- **Emoji:** \u{1F98B}',
      ].join('\n'),
    );

    // SOUL.md
    fs.writeFileSync(
      path.join(TEMP_DIR, 'agents', 'butterfly-invest', 'SOUL.md'),
      [
        '# Soul',
        '',
        '**Think independently and question assumptions.**',
        '',
        '## Boundaries',
        '- Never share credentials',
        '- Ask before external API calls',
      ].join('\n'),
    );
  }

  // 辅助：注册测试数据
  function registerTestData(): void {
    // 注册龙虾
    db.upsertClaw({
      claw_id: TEST_CLAW_ID,
      name: 'Test Lobster',
      openclaw_dir: TEMP_DIR,
      gateway_port: 8080,
    });

    // 注册 Agent
    const agents = [
      { agent_id: 'butterfly-invest', name: 'Butterfly', emoji: '\u{1F98B}' },
      { agent_id: 'butterfly-invest-trigger', name: 'Trigger', emoji: '\u26A1' },
      { agent_id: 'butterfly-invest-variable', name: 'Variable', emoji: '\u{1F9E0}' },
      { agent_id: 'butterfly-invest-industry', name: 'Industry', emoji: '\u{1F3ED}' },
      { agent_id: 'butterfly-invest-asset', name: 'Asset', emoji: '\u{1F5FA}\uFE0F' },
      { agent_id: 'butterfly-invest-redteam', name: 'Redteam', emoji: '\u{1F6E1}\uFE0F' },
    ];

    for (const agent of agents) {
      db.upsertAgent({
        agent_id: agent.agent_id,
        claw_id: TEST_CLAW_ID,
        name: agent.name,
        emoji: agent.emoji,
      });
    }

    // 创建默认工作空间
    try {
      db.createWorkspace({ name: 'Test Workspace', owner_id: 0 });
    } catch {
      // ignore if already exists
    }
  }

  // 辅助：通过 WebSocket 发送 Hook 消息
  function sendHookMessage(
    msg: { type: string; payload: Record<string, unknown> },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const hookWs = new WebSocket(`ws://localhost:${wsPort}/ws/hook`);
      hookWs.on('open', () => {
        hookWs.send(JSON.stringify(msg));
        // 给服务端一点时间处理
        setTimeout(() => {
          hookWs.close();
          resolve();
        }, 200);
      });
      hookWs.on('error', reject);
    });
  }

  // 辅助：连接前端 WebSocket 并收集消息
  function connectFrontendWs(): Promise<{
    messages: unknown[];
    close: () => void;
    ws: WebSocket;
  }> {
    return new Promise((resolve, reject) => {
      const messages: unknown[] = [];
      const ws = new WebSocket(`ws://localhost:${wsPort}/ws/frontend`);
      ws.on('open', () => {
        resolve({
          messages,
          close: () => ws.close(),
          ws,
        });
      });
      ws.on('message', (data) => {
        try {
          messages.push(JSON.parse(data.toString()));
        } catch {
          // ignore
        }
      });
      ws.on('error', reject);
    });
  }

  beforeAll(async () => {
    // 创建模拟目录
    createMockOpenclawDir();

    // 用临时数据库
    db = new Database(TEMP_DB);

    // 注册测试数据
    registerTestData();

    // 启动 WS 服务（端口 0 = 随机分配）
    wsServer = new WsServer({ port: 0, db });
    wsServer.start();

    // 等待 WS 服务启动
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    wsPort = wsServer.getPort();

    // 启动 API 服务
    apiServer = await createApiServer({ port: 0, db });
    await apiServer.listen({ port: 0 });
  }, 15000);

  afterAll(async () => {
    // 关闭所有服务
    try { wsServer.stop(); } catch { /* ignore */ }
    try { await apiServer.close(); } catch { /* ignore */ }
    try { db.close(); } catch { /* ignore */ }

    // 清理临时文件
    try { fs.unlinkSync(TEMP_DB); } catch { /* ignore */ }
    try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── 测试 1：龙虾注册后 API 能查到 ──
  it('注册龙虾后通过 API 查询', async () => {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/workspaces/ws1/claws',
    });
    expect(res.statusCode).toBe(200);
    const claws = JSON.parse(res.body);
    expect(Array.isArray(claws)).toBe(true);
    expect(claws.length).toBeGreaterThan(0);

    // 验证龙虾有 claw_id
    const claw = claws.find((c: { claw_id: string }) => c.claw_id === TEST_CLAW_ID);
    expect(claw).toBeDefined();
  });

  // ── 测试 2：Agent 列表 ──
  it('Agent 列表包含已注册的 Agent', async () => {
    const res = await apiServer.inject({
      method: 'GET',
      url: `/api/v1/claws/${TEST_CLAW_ID}/agents`,
    });
    expect(res.statusCode).toBe(200);
    const agents = JSON.parse(res.body);
    expect(agents.length).toBe(6);

    const trigger = agents.find((a: { agent_id: string }) => a.agent_id === 'butterfly-invest-trigger');
    expect(trigger).toBeDefined();
    expect(trigger.emoji).toBe('\u26A1');
  });

  // ── 测试 3：Hook agent_execution 写入后 API 能查到 ──
  it('Hook agent_execution 写入后 API 能查到', async () => {
    const runId = `e2e-test-run-${Date.now()}`;

    await sendHookMessage({
      type: 'agent_execution',
      payload: {
        claw_id: TEST_CLAW_ID,
        agent_id: 'butterfly-invest-trigger',
        run_id: runId,
        status: 'completed',
        duration_ms: 2500,
        token_usage: { input: 1000, output: 500, total: 1500 },
        has_tool_calls: true,
        timestamp: Date.now(),
      },
    });

    // 查询 API
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/workspaces/ws1/executions',
    });
    expect(res.statusCode).toBe(200);
    const executions = JSON.parse(res.body);
    expect(executions.length).toBeGreaterThan(0);

    // 验证 execution 存在
    const found = executions.find((e: { execution_id: string }) => e.execution_id === runId);
    expect(found).toBeDefined();
    expect(found.status).toBe('completed');
  });

  // ── 测试 4：Hook 事件推送到前端 WebSocket ──
  it('Hook 事件推送到前端 WebSocket', async () => {
    const frontend = await connectFrontendWs();

    // 等待连接稳定
    await new Promise<void>((r) => setTimeout(r, 200));

    const runId = `e2e-ws-push-${Date.now()}`;
    await sendHookMessage({
      type: 'agent_execution',
      payload: {
        claw_id: TEST_CLAW_ID,
        agent_id: 'butterfly-invest-variable',
        run_id: runId,
        status: 'completed',
        duration_ms: 3000,
        token_usage: { input: 800, output: 400, total: 1200 },
        has_tool_calls: false,
        timestamp: Date.now(),
      },
    });

    // 等待推送
    await new Promise<void>((r) => setTimeout(r, 500));

    frontend.close();

    // 验证收到推送
    expect(frontend.messages.length).toBeGreaterThan(0);
    const executionMsg = frontend.messages.find(
      (m: unknown) => (m as { type: string }).type === 'execution.new',
    );
    expect(executionMsg).toBeDefined();
  });

  // ── 测试 5：文件追踪检测到变更并写入数据库 ──
  it('文件追踪检测到变更并写入数据库', async () => {
    const tracker = new FileTracker(TEMP_DIR, db, 999999);
    const changes = tracker.runOnce();

    expect(changes.length).toBeGreaterThan(0);

    // 验证 file_versions 表有记录
    const versions = db.rawAll(
      "SELECT * FROM file_versions WHERE file_path LIKE '%IDENTITY%'",
    );
    expect(versions.length).toBeGreaterThan(0);
  });

  // ── 测试 6：工作流图 API 返回有效数据 ──
  it('工作流图包含节点和边', async () => {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/workspaces/ws1/workflow-graph',
    });
    expect(res.statusCode).toBe(200);
    const graph = JSON.parse(res.body);

    expect(graph.nodes).toBeDefined();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);

    // 验证节点有 position
    for (const node of graph.nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }

    // 验证有 metadata
    expect(graph.metadata).toBeDefined();
    expect(graph.metadata.generated_at).toBeDefined();
  });

  // ── 测试 7：Agent 画像包含解析后的身份信息 ──
  it('Agent 画像包含解析后的身份信息', async () => {
    // 先确保核心文件已入库（通过 tracker）
    const tracker = new FileTracker(TEMP_DIR, db, 999999);
    tracker.runOnce();

    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/agents/butterfly-invest',
    });
    expect(res.statusCode).toBe(200);
    const profile = JSON.parse(res.body);

    expect(profile.agent_id).toBe('butterfly-invest');
    expect(profile.name).toBeDefined();
    expect(profile.emoji).toBeDefined();

    // 如果 identity 核心文件已入库，验证解析结果
    if (profile.identity) {
      expect(profile.identity.name).toBeDefined();
    }
  });

  // ── 测试 8：活动日志 ──
  it('活动日志包含执行事件', async () => {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/workspaces/ws1/activity?limit=10',
    });
    expect(res.statusCode).toBe(200);
    const activities = JSON.parse(res.body);
    expect(Array.isArray(activities)).toBe(true);
    // 前面的测试已经插入了 execution，所以应该有活动
    expect(activities.length).toBeGreaterThan(0);
  });

  // ── 测试 9：去重 ──
  it('同一 run_id 不重复记录', async () => {
    const runId = `e2e-dedup-${Date.now()}`;
    const hookMsg = {
      type: 'agent_execution',
      payload: {
        claw_id: TEST_CLAW_ID,
        agent_id: 'butterfly-invest-redteam',
        run_id: runId,
        status: 'completed',
        duration_ms: 1500,
        token_usage: { input: 600, output: 300, total: 900 },
        has_tool_calls: false,
        timestamp: Date.now(),
      },
    };

    // 发送两次相同 run_id
    await sendHookMessage(hookMsg);
    await sendHookMessage(hookMsg);

    // 查询数据库
    const results = db.rawAll(
      'SELECT * FROM executions WHERE execution_id = ?',
      runId,
    );
    expect(results.length).toBe(1);
  });

  // ── 测试 10：claw_online / claw_offline 状态更新 ──
  it('claw_online 和 claw_offline 更新龙虾状态', async () => {
    await sendHookMessage({
      type: 'claw_online',
      payload: { claw_id: TEST_CLAW_ID, timestamp: Date.now() },
    });

    let claw = db.getClawById(TEST_CLAW_ID) as { status: string } | undefined;
    expect(claw?.status).toBe('online');

    await sendHookMessage({
      type: 'claw_offline',
      payload: { claw_id: TEST_CLAW_ID, timestamp: Date.now() },
    });

    claw = db.getClawById(TEST_CLAW_ID) as { status: string } | undefined;
    expect(claw?.status).toBe('offline');
  });

  // ── 测试 11：subagent_spawned 写入 agent_relations ──
  it('subagent_spawned 写入 agent_relations', async () => {
    await sendHookMessage({
      type: 'subagent_spawned',
      payload: {
        claw_id: TEST_CLAW_ID,
        parent_key: 'butterfly-invest',
        child_key: 'butterfly-invest-variable',
        task: 'E2E test task',
        timestamp: Date.now(),
      },
    });

    const relations = db.rawAll(
      "SELECT * FROM agent_relations WHERE source_agent_id = 'butterfly-invest' AND target_agent_id = 'butterfly-invest-variable' AND relation_type = 'subagent'",
    );
    expect(relations.length).toBe(1);
  });

  // ── 测试 12：健康检查端点 ──
  it('健康检查返回 ok', async () => {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
