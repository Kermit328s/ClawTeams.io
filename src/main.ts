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

const OPENCLAW_DIR = process.env.OPENCLAW_DIR ?? path.join(process.env.HOME ?? '', '.openclaw');
const DB_PATH = path.join(__dirname, '..', 'data', 'clawteams.sqlite');
const WS_PORT = parseInt(process.env.WS_PORT ?? '3001', 10);
const API_PORT = parseInt(process.env.API_PORT ?? '3000', 10);

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  ClawTeams 文件追踪 + WebSocket + HTTP API 服务');
  console.log('='.repeat(60));
  console.log();

  // 验证 OpenClaw 目录存在
  if (!fs.existsSync(OPENCLAW_DIR)) {
    console.error(`错误: OpenClaw 目录不存在 — ${OPENCLAW_DIR}`);
    console.error('请设置 OPENCLAW_DIR 环境变量或确认 ~/.openclaw/ 存在');
    process.exit(1);
  }

  console.log(`OpenClaw 目录: ${OPENCLAW_DIR}`);
  console.log(`数据库路径:   ${DB_PATH}`);
  console.log(`WebSocket 端口: ${WS_PORT}`);
  console.log(`HTTP API 端口:  ${API_PORT}`);
  console.log();

  // 初始化数据库
  const db = new Database(DB_PATH);
  console.log('[DB] 数据库初始化完成');

  // 注册龙虾信息
  registerClaw(db, OPENCLAW_DIR);

  // 启动 HTTP API 服务
  const apiServer = await createApiServer({ port: API_PORT, db });
  await apiServer.listen({ port: API_PORT, host: '0.0.0.0' });
  console.log(`[API] HTTP API 服务已启动: http://localhost:${API_PORT}`);

  // 启动 WebSocket 服务
  const wsServer = new WsServer({
    port: WS_PORT,
    db,
    onHookEvent: (msg) => {
      console.log(`[Hook] 收到事件: ${msg.type}`);
    },
  });

  // 启动文件追踪
  const tracker = new FileTracker(OPENCLAW_DIR, db);

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
  console.log('所有服务已启动，按 Ctrl+C 停止');
  console.log(`  HTTP API:   http://localhost:${API_PORT}/api/v1/health`);
  console.log(`  WebSocket:  ws://localhost:${WS_PORT}/ws/hook`);
  console.log(`  前端推送:   ws://localhost:${WS_PORT}/ws/frontend`);
  console.log();
}

/**
 * 从 openclaw.json 和 device.json 注册龙虾及其 Agent
 */
function registerClaw(db: Database, openclawDir: string): void {
  const parser = new MdParser();

  // 读取 openclaw.json
  const configPath = path.join(openclawDir, 'openclaw.json');
  if (!fs.existsSync(configPath)) {
    console.warn('[注册] 未找到 openclaw.json');
    return;
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const registration = parser.parseConfig(configContent);

  // 读取 device.json 获取 claw_id
  const devicePath = path.join(openclawDir, 'identity', 'device.json');
  if (fs.existsSync(devicePath)) {
    const device = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
    registration.claw_id = device.deviceId ?? '';
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

  // 注册所有 Agent
  for (const agent of registration.agents) {
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
}

// 运行
main();
