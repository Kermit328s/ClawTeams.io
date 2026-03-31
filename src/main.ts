import * as path from 'path';
import * as fs from 'fs';
import { Database } from './store/database';
import { FileTracker } from './tracker/file-tracker';
import { MdParser } from './tracker/md-parser';
import { WsServer } from './server/ws-server';
import { createApiServer } from './api/server';

// ============================================================
// ClawTeams 文件追踪 + WebSocket + HTTP API 服务 — 入口
// ============================================================

// ---- 解析命令行参数 ----
function parseArgs(): { openclawDir: string; wsPort: number; apiPort: number; dbPath: string } {
  const args = process.argv.slice(2);
  let openclawDir = process.env.OPENCLAW_DIR ?? path.join(process.env.HOME ?? '', '.openclaw');
  const wsPort = parseInt(process.env.WS_PORT ?? '3001', 10);
  const apiPort = parseInt(process.env.API_PORT ?? '3000', 10);
  const dbPath = process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'clawteams.sqlite');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--openclaw-dir' && args[i + 1]) {
      openclawDir = args[++i];
    }
  }

  return { openclawDir, wsPort, apiPort, dbPath };
}

async function main(): Promise<void> {
  const { openclawDir, wsPort, apiPort, dbPath } = parseArgs();

  console.log('='.repeat(60));
  console.log('  ClawTeams 文件追踪 + WebSocket + HTTP API 服务');
  console.log('='.repeat(60));
  console.log();

  // 验证 OpenClaw 目录存在
  if (!fs.existsSync(openclawDir)) {
    console.error(`错误: OpenClaw 目录不存在 — ${openclawDir}`);
    console.error('请设置 OPENCLAW_DIR 环境变量或使用 --openclaw-dir 参数');
    process.exit(1);
  }

  console.log(`OpenClaw 目录: ${openclawDir}`);
  console.log(`数据库路径:   ${dbPath}`);
  console.log(`WebSocket 端口: ${wsPort}`);
  console.log(`HTTP API 端口:  ${apiPort}`);
  console.log();

  // 初始化数据库
  const db = new Database(dbPath);
  console.log('[DB] 数据库初始化完成');

  // 注册龙虾信息（增强版：从 IDENTITY.md 读取 emoji 和角色名）
  const { clawId, agentCount } = registerClaw(db, openclawDir);

  // 创建默认工作空间
  ensureDefaultWorkspace(db);

  // 启动 HTTP API 服务
  const apiServer = await createApiServer({ port: apiPort, db });
  await apiServer.listen({ port: apiPort, host: '0.0.0.0' });
  console.log(`[API] HTTP API 服务已启动: http://localhost:${apiPort}`);

  // 启动 WebSocket 服务
  const wsServer = new WsServer({
    port: wsPort,
    db,
    onHookEvent: (msg) => {
      console.log(`[Hook] 收到事件: ${msg.type}`);
    },
  });

  // 启动文件追踪
  const tracker = new FileTracker(openclawDir, db);

  tracker.onChange((changes) => {
    console.log();
    console.log(`[变更] 检测到 ${changes.length} 个文件变更:`);
    for (const change of changes) {
      const icon = change.change_type === 'added' ? '+' : change.change_type === 'deleted' ? '-' : '~';
      const agent = change.agent_id ? ` [${change.agent_id}]` : '';
      const type = change.core_file_type ? ` (${change.core_file_type})` : '';
      console.log(`  ${icon} ${change.file_path}${agent}${type}`);
    }

    // 文件追踪的变更也推送给前端
    for (const change of changes) {
      wsServer.broadcastToFrontend({
        type: 'file.changed',
        payload: {
          file_path: change.file_path,
          change_type: change.change_type,
          agent_id: change.agent_id,
        },
        timestamp: Date.now(),
      });
    }
  });

  tracker.start();
  wsServer.start();

  // 优雅关闭
  const shutdown = async () => {
    console.log('\n[关闭] 正在停止服务...');
    tracker.stop();
    wsServer.stop();
    await apiServer.close();
    db.close();
    console.log('[关闭] 已停止');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log();
  console.log('='.repeat(60));
  console.log('  ClawTeams 阶段一启动完成');
  console.log('='.repeat(60));
  console.log(`  API:        http://localhost:${apiPort}`);
  console.log(`  WebSocket:  ws://localhost:${wsPort}`);
  console.log(`  前端:       cd src/frontend && npm run dev`);
  if (clawId) {
    console.log(`  龙虾:       ${openclawDir} (${agentCount} 个 Agent)`);
  }
  console.log(`  文件追踪:   每 10 秒扫描`);
  console.log('='.repeat(60));
  console.log();
  console.log('按 Ctrl+C 停止所有服务');
}

/**
 * 从 openclaw.json 和 device.json 注册龙虾及其 Agent
 * 增强：从各 Agent 的 IDENTITY.md 读取 emoji 和角色名
 */
function registerClaw(db: Database, openclawDir: string): { clawId: string; agentCount: number } {
  const parser = new MdParser();

  // 读取 openclaw.json
  const configPath = path.join(openclawDir, 'openclaw.json');
  if (!fs.existsSync(configPath)) {
    console.warn('[注册] 未找到 openclaw.json');
    return { clawId: '', agentCount: 0 };
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const registration = parser.parseConfig(configContent);

  // 读取 device.json 获取 claw_id
  const devicePath = path.join(openclawDir, 'identity', 'device.json');
  if (fs.existsSync(devicePath)) {
    try {
      const device = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
      registration.claw_id = device.deviceId ?? '';
    } catch {
      // ignore
    }
  }

  if (!registration.claw_id) {
    registration.claw_id = `local-${Date.now()}`;
  }

  // 注册龙虾
  db.upsertClaw({
    claw_id: registration.claw_id,
    name: `Kermit's Lobster`,
    openclaw_dir: openclawDir,
    gateway_port: registration.gateway_port,
  });

  console.log(`[注册] 龙虾已注册: ${registration.claw_id.substring(0, 12)}...`);
  console.log(`[注册] 网关端口: ${registration.gateway_port}`);
  console.log(`[注册] 默认模型: ${registration.model_default}`);
  console.log(`[注册] Agent 数量: ${registration.agents.length}`);

  // 注册所有 Agent（增强：从 IDENTITY.md 读取）
  for (const agent of registration.agents) {
    // 尝试从 IDENTITY.md 读取更多信息
    const identityPath = path.join(openclawDir, 'agents', agent.agent_id, 'IDENTITY.md');
    if (fs.existsSync(identityPath)) {
      try {
        const identityContent = fs.readFileSync(identityPath, 'utf-8');
        const identity = parser.parseIdentity(identityContent);
        if (identity.emoji && !agent.emoji) agent.emoji = identity.emoji;
        if (identity.name && !agent.name) agent.name = identity.name;
      } catch {
        // ignore parse errors
      }
    }

    db.upsertAgent({
      agent_id: agent.agent_id,
      claw_id: registration.claw_id,
      name: agent.name,
      emoji: agent.emoji,
      theme: agent.theme,
      model: agent.model,
      workspace_path: agent.workspace_path,
    });

    const emoji = agent.emoji || '  ';
    console.log(`  ${emoji} ${agent.agent_id} (${agent.name || agent.agent_id})`);
  }

  console.log();
  return { clawId: registration.claw_id, agentCount: registration.agents.length };
}

/**
 * 确保存在默认工作空间
 */
function ensureDefaultWorkspace(db: Database): void {
  try {
    const workspaces = db.getWorkspaces();
    if (workspaces.length === 0) {
      db.createWorkspace({ name: 'Default Workspace', owner_id: 0 });
      console.log('[注册] 创建默认工作空间');
    }
  } catch {
    // ignore
  }
}

// 运行
main();
