/**
 * 龙虾在线状态追踪
 *
 * 追踪每个龙虾的在线/离线状态和三层信息同步状态
 */

import { EventEmitter } from 'events';
import type { AgentCapability, AgentHeartbeatStatus } from '../../infra/shared';
import type {
  AgentThreeLayers,
  AgentSkillLayer,
  AgentEnvironmentLayer,
  AgentDataContextLayer,
} from '../types';

export type OnlineStatus = 'online' | 'offline' | 'reconnecting';

export interface AgentStateSnapshot {
  agent_id: string;
  online_status: OnlineStatus;
  heartbeat_status?: AgentHeartbeatStatus;
  last_seen_at?: string;
  connected_at?: string;
  session_id?: string;
  three_layers?: AgentThreeLayers;
  sync_pending: boolean;
}

export class AgentStateTracker extends EventEmitter {
  private states = new Map<string, AgentStateSnapshot>();

  constructor() {
    super();
    this.setMaxListeners(500);
  }

  /**
   * 龙虾上线
   */
  markOnline(agentId: string, sessionId: string): void {
    const existing = this.states.get(agentId);
    const now = new Date().toISOString();

    const snapshot: AgentStateSnapshot = {
      agent_id: agentId,
      online_status: 'online',
      last_seen_at: now,
      connected_at: now,
      session_id: sessionId,
      three_layers: existing?.three_layers,
      sync_pending: !!existing?.three_layers, // 有之前的数据则标记需要同步
    };

    this.states.set(agentId, snapshot);
    this.emit('status_changed', { agent_id: agentId, status: 'online' });
  }

  /**
   * 龙虾下线
   */
  markOffline(agentId: string): void {
    const existing = this.states.get(agentId);
    if (existing) {
      existing.online_status = 'offline';
      existing.session_id = undefined;
      this.emit('status_changed', { agent_id: agentId, status: 'offline' });
    }
  }

  /**
   * 龙虾重连中
   */
  markReconnecting(agentId: string): void {
    const existing = this.states.get(agentId);
    if (existing) {
      existing.online_status = 'reconnecting';
      this.emit('status_changed', { agent_id: agentId, status: 'reconnecting' });
    }
  }

  /**
   * 更新心跳状态
   */
  updateHeartbeat(agentId: string, status: AgentHeartbeatStatus): void {
    const snapshot = this.states.get(agentId);
    if (snapshot) {
      snapshot.heartbeat_status = status;
      snapshot.last_seen_at = new Date().toISOString();
    }
  }

  /**
   * 更新技能层信息
   */
  updateSkillLayer(agentId: string, layer: AgentSkillLayer): void {
    this.ensureThreeLayers(agentId);
    const snapshot = this.states.get(agentId)!;
    snapshot.three_layers!.skill = layer;
    this.emit('skill_layer_updated', { agent_id: agentId, layer });
  }

  /**
   * 更新环境层信息
   */
  updateEnvironmentLayer(agentId: string, layer: AgentEnvironmentLayer): void {
    this.ensureThreeLayers(agentId);
    const snapshot = this.states.get(agentId)!;
    snapshot.three_layers!.environment = layer;
    this.emit('environment_layer_updated', { agent_id: agentId, layer });
  }

  /**
   * 更新数据上下文层
   */
  updateDataContextLayer(agentId: string, layer: AgentDataContextLayer): void {
    this.ensureThreeLayers(agentId);
    const snapshot = this.states.get(agentId)!;
    snapshot.three_layers!.data_context = layer;
    this.emit('data_context_layer_updated', { agent_id: agentId, layer });
  }

  /**
   * 标记同步完成
   */
  markSynced(agentId: string): void {
    const snapshot = this.states.get(agentId);
    if (snapshot) {
      snapshot.sync_pending = false;
      this.emit('sync_completed', { agent_id: agentId });
    }
  }

  /**
   * 标记需要同步
   */
  markSyncPending(agentId: string): void {
    const snapshot = this.states.get(agentId);
    if (snapshot) {
      snapshot.sync_pending = true;
    }
  }

  /**
   * 获取龙虾状态快照
   */
  getState(agentId: string): AgentStateSnapshot | undefined {
    return this.states.get(agentId);
  }

  /**
   * 获取所有在线龙虾
   */
  getOnlineAgents(): AgentStateSnapshot[] {
    return Array.from(this.states.values()).filter(
      (s) => s.online_status === 'online',
    );
  }

  /**
   * 获取需要同步的龙虾
   */
  getPendingSyncAgents(): AgentStateSnapshot[] {
    return Array.from(this.states.values()).filter(
      (s) => s.online_status === 'online' && s.sync_pending,
    );
  }

  /**
   * 龙虾是否在线
   */
  isOnline(agentId: string): boolean {
    return this.states.get(agentId)?.online_status === 'online';
  }

  /**
   * 清除龙虾状态（用于注销）
   */
  remove(agentId: string): void {
    this.states.delete(agentId);
  }

  /**
   * 确保三层信息结构存在
   */
  private ensureThreeLayers(agentId: string): void {
    let snapshot = this.states.get(agentId);
    if (!snapshot) {
      snapshot = {
        agent_id: agentId,
        online_status: 'offline',
        sync_pending: false,
      };
      this.states.set(agentId, snapshot);
    }

    if (!snapshot.three_layers) {
      const now = new Date().toISOString();
      snapshot.three_layers = {
        skill: {
          agent_id: agentId,
          tools: [],
          parameters: {},
          capabilities: [],
          updated_at: now,
        },
        environment: {
          agent_id: agentId,
          dependencies: {},
          env_vars: {},
          updated_at: now,
        },
        data_context: {
          agent_id: agentId,
          execution_history_ids: [],
          business_data_refs: [],
          team_id: '',
          updated_at: now,
        },
      };
    }
  }
}
