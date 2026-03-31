// ============================================================
// ClawTeams Hook 事件处理器
// ============================================================

import { Database } from '../store/database';
import {
  HookMessage,
  FrontendEvent,
  ClawOnlinePayload,
  ClawOfflinePayload,
  AgentExecutionPayload,
  SubagentSpawnedPayload,
  SubagentEndedPayload,
} from './types';

/**
 * 处理来自龙虾 Plugin 的 Hook 事件
 * 负责：解析 → 写入数据库 → 触发前端推送
 */
export class HookHandler {
  private db: Database;
  private broadcastToFrontend: (event: FrontendEvent) => void;

  constructor(db: Database, broadcastToFrontend: (event: FrontendEvent) => void) {
    this.db = db;
    this.broadcastToFrontend = broadcastToFrontend;
  }

  /**
   * 处理 Hook 消息（按类型分发）
   */
  handle(msg: HookMessage): void {
    const now = Date.now();

    switch (msg.type) {
      case 'claw_online':
        this.handleClawOnline(msg.payload as ClawOnlinePayload, now);
        break;
      case 'claw_offline':
        this.handleClawOffline(msg.payload as ClawOfflinePayload, now);
        break;
      case 'agent_execution':
        this.handleAgentExecution(msg.payload as AgentExecutionPayload, now);
        break;
      case 'subagent_spawned':
        this.handleSubagentSpawned(msg.payload as SubagentSpawnedPayload, now);
        break;
      case 'subagent_ended':
        this.handleSubagentEnded(msg.payload as SubagentEndedPayload, now);
        break;
      default:
        console.warn(`[HookHandler] 未知消息类型: ${(msg as HookMessage).type}`);
    }
  }

  /**
   * 龙虾上线：更新状态 + 广播
   */
  private handleClawOnline(payload: ClawOnlinePayload, now: number): void {
    console.log(`[HookHandler] 龙虾上线: ${payload.claw_id}`);

    this.db.updateClawStatus(payload.claw_id, 'online');

    this.broadcastToFrontend({
      type: 'claw.status',
      payload: {
        claw_id: payload.claw_id,
        status: 'online',
      },
      timestamp: now,
    });
  }

  /**
   * 龙虾离线：更新状态 + 广播
   */
  private handleClawOffline(payload: ClawOfflinePayload, now: number): void {
    console.log(`[HookHandler] 龙虾离线: ${payload.claw_id}`);

    this.db.updateClawStatus(payload.claw_id, 'offline');

    this.broadcastToFrontend({
      type: 'claw.status',
      payload: {
        claw_id: payload.claw_id,
        status: 'offline',
      },
      timestamp: now,
    });
  }

  /**
   * Agent 执行完成：去重 → 写入 executions → 更新 agent 状态 → 广播
   */
  private handleAgentExecution(payload: AgentExecutionPayload, now: number): void {
    console.log(`[HookHandler] Agent 执行: ${payload.agent_id} run=${payload.run_id} status=${payload.status}`);

    // 去重检查：用 run_id 查找已有记录（可能文件追踪已经记录了同一个执行）
    const existing = this.db.getExecutionByRunId(payload.run_id);
    if (existing) {
      console.log(`[HookHandler] 执行已存在（run_id=${payload.run_id}），跳过`);
      return;
    }

    // 写入 executions 表
    this.db.insertExecutionFromHook({
      agent_id: payload.agent_id,
      claw_id: payload.claw_id,
      run_id: payload.run_id,
      status: payload.status,
      duration_ms: payload.duration_ms,
      token_input: payload.token_usage?.input,
      token_output: payload.token_usage?.output,
      token_total: payload.token_usage?.total,
      has_tool_calls: payload.has_tool_calls,
      timestamp: payload.timestamp,
    });

    // 更新 agent 状态
    const agentStatus = payload.status === 'failed' ? 'failed' : 'idle';
    this.db.updateAgentStatus(payload.claw_id, payload.agent_id, agentStatus);

    // 广播 execution.new
    this.broadcastToFrontend({
      type: 'execution.new',
      payload: {
        claw_id: payload.claw_id,
        agent_id: payload.agent_id,
        run_id: payload.run_id,
        status: payload.status,
        duration_ms: payload.duration_ms,
        token_usage: payload.token_usage,
        has_tool_calls: payload.has_tool_calls,
      },
      timestamp: now,
    });

    // 广播 agent.status
    this.broadcastToFrontend({
      type: 'agent.status',
      payload: {
        claw_id: payload.claw_id,
        agent_id: payload.agent_id,
        status: agentStatus,
      },
      timestamp: now,
    });
  }

  /**
   * Subagent 生成：写入 agent_relations → 广播
   */
  private handleSubagentSpawned(payload: SubagentSpawnedPayload, now: number): void {
    console.log(`[HookHandler] Subagent 生成: ${payload.parent_key} → ${payload.child_key}`);

    // 写入/更新 agent_relations 表
    this.db.upsertAgentRelation({
      source_agent_id: payload.parent_key,
      target_agent_id: payload.child_key,
      relation_type: 'subagent',
      source_info: `task: ${payload.task}`,
    });

    // 更新子 agent 状态为 running
    this.db.updateAgentStatus(payload.claw_id, payload.child_key, 'running');

    // 广播
    this.broadcastToFrontend({
      type: 'subagent.spawned',
      payload: {
        claw_id: payload.claw_id,
        parent_key: payload.parent_key,
        child_key: payload.child_key,
        task: payload.task,
      },
      timestamp: now,
    });
  }

  /**
   * Subagent 完成：更新关系 + 广播
   */
  private handleSubagentEnded(payload: SubagentEndedPayload, now: number): void {
    console.log(`[HookHandler] Subagent 完成: ${payload.child_key} outcome=${payload.outcome}`);

    // 更新子 agent 状态为 idle
    this.db.updateAgentStatus(payload.claw_id, payload.child_key, 'idle');

    // 广播
    this.broadcastToFrontend({
      type: 'subagent.ended',
      payload: {
        claw_id: payload.claw_id,
        child_key: payload.child_key,
        outcome: payload.outcome,
      },
      timestamp: now,
    });
  }
}
