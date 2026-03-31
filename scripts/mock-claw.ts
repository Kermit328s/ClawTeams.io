#!/usr/bin/env npx ts-node
// ============================================================
// ClawTeams 模拟龙虾脚本
// 用法：npx ts-node scripts/mock-claw.ts
// ============================================================

import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3001/ws/hook';

// 自动读取真实 claw_id
function getClawId(): string {
  if (process.env.CLAW_ID) return process.env.CLAW_ID;
  try {
    const devicePath = path.join(process.env.HOME ?? '', '.openclaw', 'identity', 'device.json');
    const device = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
    return device.deviceId;
  } catch {
    return 'mock-claw-001';
  }
}
const CLAW_ID = getClawId();

// 模拟数据基于用户真实的 6 个 Agent
const AGENTS = [
  { id: 'butterfly-invest', name: 'Butterfly', emoji: '\u{1F98B}' },
  { id: 'butterfly-invest-trigger', name: 'Trigger', emoji: '\u26A1' },
  { id: 'butterfly-invest-variable', name: 'Variable', emoji: '\u{1F9E0}' },
  { id: 'butterfly-invest-industry', name: 'Industry', emoji: '\u{1F3ED}' },
  { id: 'butterfly-invest-asset', name: 'Asset', emoji: '\u{1F5FA}\uFE0F' },
  { id: 'butterfly-invest-redteam', name: 'Redteam', emoji: '\u{1F6E1}\uFE0F' },
];

// 模拟场景序列
interface ScenarioStep {
  description: string;
  message: { type: string; payload: Record<string, unknown> };
}

function buildScenario(): ScenarioStep[] {
  const now = () => Date.now();
  let runCounter = 0;
  const nextRunId = () => `mock-run-${Date.now()}-${++runCounter}`;

  return [
    {
      description: 'Trigger 执行 "信号扫描"',
      message: {
        type: 'agent_execution',
        payload: {
          claw_id: CLAW_ID,
          agent_id: 'butterfly-invest-trigger',
          run_id: nextRunId(),
          status: 'completed',
          duration_ms: 3200,
          token_usage: { input: 1200, output: 800, total: 2000 },
          has_tool_calls: true,
          timestamp: now(),
        },
      },
    },
    {
      description: 'Trigger 执行 "信号分析"',
      message: {
        type: 'agent_execution',
        payload: {
          claw_id: CLAW_ID,
          agent_id: 'butterfly-invest-trigger',
          run_id: nextRunId(),
          status: 'completed',
          duration_ms: 4500,
          token_usage: { input: 1800, output: 1200, total: 3000 },
          has_tool_calls: true,
          timestamp: now(),
        },
      },
    },
    {
      description: 'Invest 生成子 Agent -> Variable',
      message: {
        type: 'subagent_spawned',
        payload: {
          claw_id: CLAW_ID,
          parent_key: 'butterfly-invest',
          child_key: 'butterfly-invest-variable',
          task: '变量分析',
          timestamp: now(),
        },
      },
    },
    {
      description: 'Variable 执行 "变量分析"',
      message: {
        type: 'agent_execution',
        payload: {
          claw_id: CLAW_ID,
          agent_id: 'butterfly-invest-variable',
          run_id: nextRunId(),
          status: 'completed',
          duration_ms: 5100,
          token_usage: { input: 2400, output: 1600, total: 4000 },
          has_tool_calls: true,
          timestamp: now(),
        },
      },
    },
    {
      description: 'Invest 生成子 Agent -> Industry',
      message: {
        type: 'subagent_spawned',
        payload: {
          claw_id: CLAW_ID,
          parent_key: 'butterfly-invest',
          child_key: 'butterfly-invest-industry',
          task: '产业链分析',
          timestamp: now(),
        },
      },
    },
    {
      description: 'Industry 执行 "产业链分析"',
      message: {
        type: 'agent_execution',
        payload: {
          claw_id: CLAW_ID,
          agent_id: 'butterfly-invest-industry',
          run_id: nextRunId(),
          status: 'completed',
          duration_ms: 6200,
          token_usage: { input: 3000, output: 2000, total: 5000 },
          has_tool_calls: true,
          timestamp: now(),
        },
      },
    },
    {
      description: 'Invest 生成子 Agent -> Asset',
      message: {
        type: 'subagent_spawned',
        payload: {
          claw_id: CLAW_ID,
          parent_key: 'butterfly-invest',
          child_key: 'butterfly-invest-asset',
          task: '资产映射',
          timestamp: now(),
        },
      },
    },
    {
      description: 'Asset 执行 "资产映射"',
      message: {
        type: 'agent_execution',
        payload: {
          claw_id: CLAW_ID,
          agent_id: 'butterfly-invest-asset',
          run_id: nextRunId(),
          status: 'completed',
          duration_ms: 4800,
          token_usage: { input: 2200, output: 1400, total: 3600 },
          has_tool_calls: true,
          timestamp: now(),
        },
      },
    },
    {
      description: 'Redteam 执行 "风险评估" -> 失败（速率限制）',
      message: {
        type: 'agent_execution',
        payload: {
          claw_id: CLAW_ID,
          agent_id: 'butterfly-invest-redteam',
          run_id: nextRunId(),
          status: 'failed',
          duration_ms: 1200,
          token_usage: { input: 500, output: 0, total: 500 },
          has_tool_calls: false,
          timestamp: now(),
        },
      },
    },
    {
      description: 'Redteam 重试 "风险评估" -> 完成',
      message: {
        type: 'agent_execution',
        payload: {
          claw_id: CLAW_ID,
          agent_id: 'butterfly-invest-redteam',
          run_id: nextRunId(),
          status: 'completed',
          duration_ms: 7500,
          token_usage: { input: 4000, output: 3000, total: 7000 },
          has_tool_calls: true,
          timestamp: now(),
        },
      },
    },
    {
      description: 'Variable subagent 完成',
      message: {
        type: 'subagent_ended',
        payload: {
          claw_id: CLAW_ID,
          child_key: 'butterfly-invest-variable',
          outcome: 'success',
          timestamp: now(),
        },
      },
    },
    {
      description: 'Industry subagent 完成',
      message: {
        type: 'subagent_ended',
        payload: {
          claw_id: CLAW_ID,
          child_key: 'butterfly-invest-industry',
          outcome: 'success',
          timestamp: now(),
        },
      },
    },
    {
      description: 'Asset subagent 完成',
      message: {
        type: 'subagent_ended',
        payload: {
          claw_id: CLAW_ID,
          child_key: 'butterfly-invest-asset',
          outcome: 'success',
          timestamp: now(),
        },
      },
    },
  ];
}

function randomDelay(): number {
  return 2000 + Math.random() * 3000; // 2-5 秒
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  ClawTeams 模拟龙虾');
  console.log('='.repeat(60));
  console.log(`  WebSocket: ${WS_URL}`);
  console.log(`  Claw ID:   ${CLAW_ID}`);
  console.log(`  Agent 数:  ${AGENTS.length}`);
  console.log('='.repeat(60));
  console.log();

  const ws = new WebSocket(WS_URL);

  const sendMsg = (msg: { type: string; payload: Record<string, unknown> }): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  // Ctrl+C 时发送 claw_offline
  const cleanup = () => {
    console.log('\n[Mock] 发送 claw_offline...');
    sendMsg({
      type: 'claw_offline',
      payload: { claw_id: CLAW_ID, timestamp: Date.now() },
    });
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 500);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  ws.on('error', (err) => {
    console.error('[Mock] WebSocket 错误:', err.message);
    console.error('[Mock] 请确认 ClawTeams 服务已启动');
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('[Mock] WebSocket 已断开');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.error) {
        console.warn('[Mock] 服务端错误:', msg.error);
      }
    } catch {
      // ignore
    }
  });

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // 1. 发送 claw_online
  console.log('[Mock] 连接成功，发送 claw_online');
  sendMsg({
    type: 'claw_online',
    payload: { claw_id: CLAW_ID, timestamp: Date.now() },
  });
  await sleep(1000);

  // 2. 循环执行模拟场景
  let cycle = 1;
  while (true) {
    console.log(`\n--- 第 ${cycle} 轮模拟 ---\n`);
    const scenario = buildScenario();

    for (const step of scenario) {
      const agent = AGENTS.find((a) => {
        const p = step.message.payload;
        return a.id === (p.agent_id ?? p.child_key ?? p.parent_key);
      });
      const emoji = agent?.emoji ?? '';
      console.log(`${emoji} [Mock] ${step.description}`);

      // 更新 timestamp 为当前时间
      step.message.payload.timestamp = Date.now();
      sendMsg(step.message);

      const delay = randomDelay();
      await sleep(delay);
    }

    cycle++;
  }
}

main().catch((err) => {
  console.error('[Mock] 致命错误:', err);
  process.exit(1);
});
