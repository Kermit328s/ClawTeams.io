/**
 * 同步管理器
 *
 * 负责龙虾三层信息同步的协调：
 * - 重连后强制同步
 * - 断网缓存队列处理
 * - 同步状态追踪
 */

import type { ClawTeamsEvent } from '../../infra/shared';
import type { EventBusImpl } from '../eventbus/event-bus';
import type { ConnectionManager } from '../protocol/connection-manager';
import { AgentStateTracker } from './agent-state-tracker';
import type { AgentThreeLayers } from '../types';
import { generateId, createFrame, serializeFrame } from '../utils';

export interface SyncManagerOptions {
  eventBus: EventBusImpl;
  connectionManager: ConnectionManager;
  stateTracker: AgentStateTracker;
}

export class SyncManager {
  private readonly eventBus: EventBusImpl;
  private readonly connectionManager: ConnectionManager;
  private readonly stateTracker: AgentStateTracker;

  constructor(options: SyncManagerOptions) {
    this.eventBus = options.eventBus;
    this.connectionManager = options.connectionManager;
    this.stateTracker = options.stateTracker;

    this.setupListeners();
  }

  /**
   * 绑定连接管理器事件
   */
  private setupListeners(): void {
    // 龙虾上线：记录状态并触发同步
    this.connectionManager.on('agent_connected', async (info) => {
      const { agent_id, session_id, capabilities, runtime } = info;
      this.stateTracker.markOnline(agent_id, session_id);

      // 更新技能层
      this.stateTracker.updateSkillLayer(agent_id, {
        agent_id,
        tools: [],
        parameters: {},
        capabilities: capabilities ?? [],
        updated_at: new Date().toISOString(),
      });

      // 发布注册事件
      await this.publishEvent('agent.registered', agent_id, {
        agent_id,
        session_id,
        capabilities,
        runtime,
      });

      // 检查是否需要强制同步
      if (this.stateTracker.getState(agent_id)?.sync_pending) {
        await this.forceSyncAgent(agent_id);
      }
    });

    // 龙虾下线：更新状态
    this.connectionManager.on('agent_disconnected', async (info) => {
      const { agent_id } = info;
      this.stateTracker.markOffline(agent_id);

      await this.publishEvent('agent.disconnected', agent_id, {
        agent_id,
        disconnected_at: new Date().toISOString(),
      });
    });

    // 心跳：更新状态
    this.connectionManager.on('agent_heartbeat', (info) => {
      this.stateTracker.updateHeartbeat(info.agent_id, info.status);
    });
  }

  /**
   * 强制同步龙虾的三层信息
   * 重连后调用，确保大脑和龙虾的状态一致
   */
  async forceSyncAgent(agentId: string): Promise<void> {
    const state = this.stateTracker.getState(agentId);
    if (!state || state.online_status !== 'online') return;

    // 发送同步请求给龙虾（请求龙虾上报最新三层信息）
    const syncFrame = createFrame('task.assign', {
      task_id: generateId(),
      task_type: '__system_sync',
      input: { sync_type: 'full', layers: ['skill', 'environment', 'data_context'] },
      priority: 'high',
      deadline: new Date(Date.now() + 60_000).toISOString(),
    });

    const sent = this.connectionManager.sendToAgent(agentId, syncFrame);
    if (sent) {
      // 发布同步事件
      await this.publishEvent('agent.capability_updated', agentId, {
        agent_id: agentId,
        sync_type: 'forced',
      });
    }

    this.stateTracker.markSynced(agentId);
  }

  /**
   * 同步所有待同步的龙虾
   */
  async syncAllPending(): Promise<void> {
    const pending = this.stateTracker.getPendingSyncAgents();
    await Promise.allSettled(
      pending.map((agent) => this.forceSyncAgent(agent.agent_id)),
    );
  }

  /**
   * 更新龙虾的三层信息
   */
  updateThreeLayers(agentId: string, layers: Partial<AgentThreeLayers>): void {
    if (layers.skill) {
      this.stateTracker.updateSkillLayer(agentId, layers.skill);
    }
    if (layers.environment) {
      this.stateTracker.updateEnvironmentLayer(agentId, layers.environment);
    }
    if (layers.data_context) {
      this.stateTracker.updateDataContextLayer(agentId, layers.data_context);
    }
  }

  /**
   * 获取状态追踪器
   */
  getStateTracker(): AgentStateTracker {
    return this.stateTracker;
  }

  /**
   * 发布事件到事件总线
   */
  private async publishEvent(
    eventType: string,
    agentId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: ClawTeamsEvent = {
      event_id: generateId(),
      event_type: eventType as ClawTeamsEvent['event_type'],
      source: {
        service: 'connector',
        agent_id: agentId,
      },
      timestamp: new Date().toISOString(),
      payload,
    };

    await this.eventBus.publish(event);
  }
}
