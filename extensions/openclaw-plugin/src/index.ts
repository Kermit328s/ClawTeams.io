// ============================================================
// ClawTeams OpenClaw Plugin 入口
// 注册 5 个轻量 Hook，全部 fire-and-forget
// ============================================================

import { ClawTeamsClient } from './clawteams-client';

/**
 * OpenClaw Plugin 入口函数。
 * OpenClaw 在加载 Plugin 时调用此函数，传入 api 和 config。
 */
export default function clawteamsPlugin(params: any): void {
  const { api, config } = params;

  const serverUrl = getConfigValue(config, 'clawteams.serverUrl', 'ws://localhost:3001/ws/hook');
  const clawId = getConfigValue(config, 'clawteams.clawId', 'default-claw');

  const client = new ClawTeamsClient({ serverUrl, clawId });

  // ── Hook 1: gateway_start → 龙虾上线 ──
  api.on('gateway_start', async () => {
    client.connect();
    return {};
  });

  // ── Hook 2: gateway_stop → 龙虾离线 ──
  api.on('gateway_stop', async () => {
    client.send({
      type: 'claw_offline',
      payload: {
        claw_id: clawId,
        timestamp: Date.now(),
      },
    });
    // 给一点时间让消息发出去再断开
    setTimeout(() => client.disconnect(), 500);
    return {};
  });

  // ── Hook 3: agent_end → Agent 完成执行 ──
  api.on('agent_end', async (event: any) => {
    client.send({
      type: 'agent_execution',
      payload: {
        claw_id: clawId,
        agent_id: event.agentId || 'unknown',
        run_id: event.runId || '',
        duration_ms: event.meta?.durationMs,
        status: event.meta?.error ? 'failed' : 'completed',
        token_usage: event.meta?.agentMeta?.usage,
        has_tool_calls: Boolean(event.result?.payloads?.length),
        timestamp: Date.now(),
      },
    });
    return {};
  });

  // ── Hook 4: subagent_spawned → 子 Agent 生成 ──
  api.on('subagent_spawned', async (event: any) => {
    client.send({
      type: 'subagent_spawned',
      payload: {
        claw_id: clawId,
        parent_key: event.requesterSessionKey || '',
        child_key: event.childSessionKey || '',
        task: event.task || '',
        timestamp: Date.now(),
      },
    });
    return {};
  });

  // ── Hook 5: subagent_ended → 子 Agent 完成 ──
  api.on('subagent_ended', async (event: any) => {
    client.send({
      type: 'subagent_ended',
      payload: {
        claw_id: clawId,
        child_key: event.childSessionKey || '',
        outcome: event.outcome || 'unknown',
        timestamp: Date.now(),
      },
    });
    return {};
  });
}

/**
 * 安全读取 OpenClaw config 值。
 * 读取失败时返回默认值，不抛异常。
 */
function getConfigValue(config: any, key: string, defaultValue: string): string {
  try {
    const val = config.get(key);
    return typeof val === 'string' ? val : defaultValue;
  } catch {
    return defaultValue;
  }
}
