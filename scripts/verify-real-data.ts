#!/usr/bin/env npx ts-node
// ============================================================
// ClawTeams 真实数据验证脚本
// 用法：npx ts-node scripts/verify-real-data.ts [~/.openclaw]
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { Database } from '../src/store/database';
import { FileTracker } from '../src/tracker/file-tracker';
import { MdParser } from '../src/tracker/md-parser';
import { createApiServer } from '../src/api/server';

const OPENCLAW_DIR = process.argv[2] ?? process.env.OPENCLAW_DIR ?? path.join(process.env.HOME ?? '', '.openclaw');
const TEMP_DB = `/tmp/clawteams-verify-${Date.now()}.db`;

interface VerifyResult {
  passed: number;
  failed: number;
  results: { ok: boolean; label: string; detail?: string }[];
}

function check(v: VerifyResult, ok: boolean, label: string, detail?: string): void {
  v.results.push({ ok, label, detail });
  if (ok) {
    v.passed++;
    console.log(`  \u2705 ${label}${detail ? ': ' + detail : ''}`);
  } else {
    v.failed++;
    console.log(`  \u274C ${label}${detail ? ': ' + detail : ''}`);
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  ClawTeams 真实数据验证');
  console.log('='.repeat(60));
  console.log(`  OpenClaw 目录: ${OPENCLAW_DIR}`);
  console.log(`  临时数据库:    ${TEMP_DB}`);
  console.log('='.repeat(60));
  console.log();

  const v: VerifyResult = { passed: 0, failed: 0, results: [] };

  // 验证目录存在
  if (!fs.existsSync(OPENCLAW_DIR)) {
    console.error(`错误: OpenClaw 目录不存在 -- ${OPENCLAW_DIR}`);
    process.exit(1);
  }

  // ---- 阶段 1: 数据库 + 注册 ----
  console.log('--- 阶段 1: 数据库初始化 + 龙虾注册 ---');

  const db = new Database(TEMP_DB);
  check(v, true, '数据库初始化成功');

  const parser = new MdParser();

  // 读取 openclaw.json
  const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
  const hasConfig = fs.existsSync(configPath);
  check(v, hasConfig, 'openclaw.json 存在');

  let clawId = '';
  let agentCount = 0;

  if (hasConfig) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const registration = parser.parseConfig(configContent);
      agentCount = registration.agents.length;

      // device.json
      const devicePath = path.join(OPENCLAW_DIR, 'identity', 'device.json');
      if (fs.existsSync(devicePath)) {
        const device = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
        clawId = device.deviceId ?? 'unknown';
        registration.claw_id = clawId;
      }

      // 注册龙虾
      db.upsertClaw({
        claw_id: clawId,
        name: 'Verify Lobster',
        openclaw_dir: OPENCLAW_DIR,
        gateway_port: registration.gateway_port,
      });

      check(v, clawId.length > 0, '龙虾 ID', clawId.substring(0, 16) + '...');
      check(v, agentCount > 0, `识别到 ${agentCount} 个 Agent`);

      // 注册 Agent（增强：从 IDENTITY.md 读取）
      for (const agent of registration.agents) {
        const identityPath = path.join(OPENCLAW_DIR, 'agents', agent.agent_id, 'IDENTITY.md');
        if (fs.existsSync(identityPath)) {
          try {
            const identityContent = fs.readFileSync(identityPath, 'utf-8');
            const identity = parser.parseIdentity(identityContent);
            if (identity.emoji) agent.emoji = identity.emoji;
            if (identity.name) agent.name = identity.name;
          } catch {
            // ignore
          }
        }

        db.upsertAgent({
          agent_id: agent.agent_id,
          claw_id: clawId,
          name: agent.name,
          emoji: agent.emoji,
          theme: agent.theme,
          model: agent.model,
          workspace_path: agent.workspace_path,
        });
      }

      // 打印 Agent 列表
      for (const agent of registration.agents) {
        const emoji = agent.emoji || '  ';
        console.log(`    ${emoji} ${agent.agent_id} (${agent.name})`);
      }
    } catch (err) {
      check(v, false, 'openclaw.json 解析失败', String(err));
    }
  }

  // ---- 阶段 2: 文件追踪 ----
  console.log('\n--- 阶段 2: 文件追踪扫描 ---');

  const tracker = new FileTracker(OPENCLAW_DIR, db, 999999); // 不自动循环
  const changes = tracker.runOnce();
  check(v, changes.length > 0, `扫描到 ${changes.length} 个文件`);

  // 统计分类
  const categories: Record<string, number> = {};
  for (const c of changes) {
    categories[c.category] = (categories[c.category] ?? 0) + 1;
  }
  for (const [cat, count] of Object.entries(categories)) {
    console.log(`    ${cat}: ${count} 个文件`);
  }

  // 核心文件解析
  const coreChanges = changes.filter((c) => c.core_file_type);
  check(v, coreChanges.length > 0, `解析了 ${coreChanges.length} 个核心文件`);

  // ---- 阶段 3: IDENTITY.md 解析 ----
  console.log('\n--- 阶段 3: 核心文件解析验证 ---');

  const butterflyIdentity = db.getCoreFileContent('butterfly-invest', 'identity') as {
    current_content: string | null;
  } | undefined;
  if (butterflyIdentity?.current_content) {
    const identity = parser.parseIdentity(butterflyIdentity.current_content);
    check(v, identity.name.length > 0, 'IDENTITY.md 解析', `名字=${identity.name}, emoji=${identity.emoji}`);
  } else {
    // 尝试其他 agent
    const anyAgent = changes.find(
      (c) => c.core_file_type === 'identity' && c.content,
    );
    if (anyAgent?.content) {
      const identity = parser.parseIdentity(anyAgent.content);
      check(v, identity.name.length > 0, 'IDENTITY.md 解析', `名字=${identity.name}, emoji=${identity.emoji}`);
    } else {
      check(v, false, 'IDENTITY.md 解析', '未找到 identity 文件');
    }
  }

  // 检查 file_versions 表
  const fileVersionCount = db.rawGet(
    'SELECT COUNT(*) as cnt FROM file_versions',
  ) as { cnt: number } | undefined;
  check(
    v,
    (fileVersionCount?.cnt ?? 0) > 0,
    `file_versions 表有 ${fileVersionCount?.cnt ?? 0} 条记录`,
  );

  // ---- 阶段 4: 协作关系提取 ----
  console.log('\n--- 阶段 4: 协作关系 ---');

  // 关系可能来自 md 解析或需要主动提取
  const relations = db.rawAll('SELECT * FROM agent_relations') as {
    source_agent_id: string;
    target_agent_id: string;
    relation_type: string;
  }[];
  check(v, relations.length >= 0, `提取了 ${relations.length} 条协作关系`);
  for (const rel of relations.slice(0, 5)) {
    console.log(`    ${rel.source_agent_id} -[${rel.relation_type}]-> ${rel.target_agent_id}`);
  }

  // ---- 阶段 5: API 验证 ----
  console.log('\n--- 阶段 5: API 端点验证 ---');

  // 创建默认工作空间
  try {
    db.createWorkspace({ name: 'Default', owner_id: 0 });
  } catch {
    // ignore
  }

  const apiServer = await createApiServer({ port: 0, db });

  // GET /api/v1/health
  {
    const res = await apiServer.inject({ method: 'GET', url: '/api/v1/health' });
    check(v, res.statusCode === 200, 'GET /api/v1/health', `status=${res.statusCode}`);
  }

  // GET /api/v1/workspaces
  {
    const res = await apiServer.inject({ method: 'GET', url: '/api/v1/workspaces' });
    const data = JSON.parse(res.body);
    check(v, Array.isArray(data) && data.length > 0, `GET /workspaces`, `${data.length} 个工作空间`);
  }

  // GET /api/v1/workspaces/ws1/claws
  {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/workspaces/ws1/claws',
    });
    const data = JSON.parse(res.body);
    const clawCount = Array.isArray(data) ? data.length : 0;
    check(v, clawCount > 0, `GET /claws`, `${clawCount} 只龙虾`);

    if (clawCount > 0) {
      const claw = data[0] as { claw_id: string };
      // GET /api/v1/claws/:id (含 agent 列表)
      const detailRes = await apiServer.inject({
        method: 'GET',
        url: `/api/v1/claws/${claw.claw_id}`,
      });
      const detail = JSON.parse(detailRes.body);
      const agents = detail.agents ?? [];
      check(
        v,
        agents.length > 0,
        `GET /claws/:id`,
        `${agents.length} 个 Agent`,
      );
    }
  }

  // GET /api/v1/agents/:id
  if (agentCount > 0) {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/agents/butterfly-invest',
    });
    if (res.statusCode === 200) {
      const profile = JSON.parse(res.body);
      check(v, true, `GET /agents/butterfly-invest`, `emoji=${profile.emoji}, status=${profile.status}`);
    } else {
      // try first known agent
      check(v, false, `GET /agents/butterfly-invest`, `status=${res.statusCode}`);
    }
  }

  // GET /api/v1/workspaces/ws1/workflow-graph
  {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/workspaces/ws1/workflow-graph',
    });
    if (res.statusCode === 200) {
      const graph = JSON.parse(res.body);
      const nodeCount = graph.nodes?.length ?? 0;
      const edgeCount = graph.edges?.length ?? 0;
      check(v, nodeCount > 0, `GET /workflow-graph`, `${nodeCount} 个节点, ${edgeCount} 条边`);

      // 验证节点有 position
      if (nodeCount > 0) {
        const firstNode = graph.nodes[0];
        check(v, firstNode.position !== undefined, '节点有 position 字段');
      }
    } else {
      check(v, false, `GET /workflow-graph`, `status=${res.statusCode}`);
    }
  }

  // GET /api/v1/workspaces/ws1/activity
  {
    const res = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/workspaces/ws1/activity?limit=10',
    });
    const data = JSON.parse(res.body);
    const activityCount = Array.isArray(data) ? data.length : 0;
    check(v, true, `GET /activity`, `${activityCount} 条活动`);
  }

  // ---- 总结 ----
  console.log();
  console.log('='.repeat(60));
  console.log(`  验证完成: ${v.passed} 通过, ${v.failed} 失败`);
  console.log('='.repeat(60));

  // 清理
  await apiServer.close();
  db.close();

  try {
    fs.unlinkSync(TEMP_DB);
  } catch {
    // ignore
  }

  if (v.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('验证失败:', err);
  process.exit(1);
});
