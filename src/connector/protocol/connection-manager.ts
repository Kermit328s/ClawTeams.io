/**
 * 连接管理器
 * 管理龙虾的 WebSocket 连接生命周期：连接、注册、心跳、断开、重连
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type {
  AgentConnection,
  MessageFrame,
  AgentRegisterPayload,
  AgentRegisterAckPayload,
  AgentHeartbeatPayload,
  AgentHeartbeatAckPayload,
} from '../types';
import { generateId, createFrame, serializeFrame, matchEventPattern } from '../utils';

export interface ConnectionManagerOptions {
  /** 心跳超时（ms），超过此时间无心跳视为断连 */
  heartbeatTimeoutMs?: number;
  /** 心跳检查间隔（ms） */
  heartbeatCheckIntervalMs?: number;
  /** 认证回调：验证 agent_id + api_key，返回分配的角色 */
  authenticator?: (
    agentId: string,
    apiKey: string,
  ) => Promise<{ valid: boolean; roles?: string[]; error?: string }>;
}

export class ConnectionManager extends EventEmitter {
  /** agent_id -> WebSocket 映射 */
  private sockets = new Map<string, WebSocket>();
  /** agent_id -> 连接信息 */
  private connections = new Map<string, AgentConnection>();
  /** 心跳检查定时器 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private readonly heartbeatTimeoutMs: number;
  private readonly heartbeatCheckIntervalMs: number;
  private readonly authenticator: ConnectionManagerOptions['authenticator'];

  constructor(options: ConnectionManagerOptions = {}) {
    super();
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 90_000; // 3倍心跳间隔
    this.heartbeatCheckIntervalMs = options.heartbeatCheckIntervalMs ?? 30_000;
    this.authenticator = options.authenticator;
    this.setMaxListeners(1000);
  }

  /** 启动心跳检查 */
  startHeartbeatCheck(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.heartbeatCheckIntervalMs);
  }

  /** 停止心跳检查 */
  stopHeartbeatCheck(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 处理龙虾注册
   */
  async handleRegister(
    ws: WebSocket,
    frame: MessageFrame<AgentRegisterPayload>,
  ): Promise<void> {
    const { agent_id, api_key, capabilities, runtime } = frame.payload;

    // 认证
    if (this.authenticator) {
      const authResult = await this.authenticator(agent_id, api_key);
      if (!authResult.valid) {
        const ack = createFrame<AgentRegisterAckPayload>(
          'agent.register_ack',
          {
            success: false,
            session_id: '',
            error: authResult.error ?? 'AUTH_FAILED',
          },
          frame.msg_id,
        );
        ws.send(serializeFrame(ack));
        return;
      }

      // 认证通过
      const sessionId = generateId();
      const now = new Date().toISOString();

      // 如果已有旧连接，先清理
      const oldWs = this.sockets.get(agent_id);
      if (oldWs && oldWs !== ws && oldWs.readyState === 1) {
        oldWs.close(1000, 'Replaced by new connection');
      }

      const connection: AgentConnection = {
        agent_id,
        session_id: sessionId,
        connected_at: now,
        last_heartbeat_at: now,
        heartbeat_status: 'idle',
        subscribed_patterns: [],
      };

      this.sockets.set(agent_id, ws);
      this.connections.set(agent_id, connection);

      const ack = createFrame<AgentRegisterAckPayload>(
        'agent.register_ack',
        {
          success: true,
          session_id: sessionId,
          assigned_roles: authResult.roles,
        },
        frame.msg_id,
      );
      ws.send(serializeFrame(ack));

      this.emit('agent_connected', { agent_id, session_id: sessionId, capabilities, runtime });
      return;
    }

    // 无认证器时直接允许（开发模式）
    const sessionId = generateId();
    const now = new Date().toISOString();

    const oldWs = this.sockets.get(agent_id);
    if (oldWs && oldWs !== ws && oldWs.readyState === 1) {
      oldWs.close(1000, 'Replaced by new connection');
    }

    const connection: AgentConnection = {
      agent_id,
      session_id: sessionId,
      connected_at: now,
      last_heartbeat_at: now,
      heartbeat_status: 'idle',
      subscribed_patterns: [],
    };

    this.sockets.set(agent_id, ws);
    this.connections.set(agent_id, connection);

    const ack = createFrame<AgentRegisterAckPayload>(
      'agent.register_ack',
      { success: true, session_id: sessionId },
      frame.msg_id,
    );
    ws.send(serializeFrame(ack));

    this.emit('agent_connected', { agent_id, session_id: sessionId, capabilities, runtime });
  }

  /**
   * 处理心跳
   */
  handleHeartbeat(
    ws: WebSocket,
    frame: MessageFrame<AgentHeartbeatPayload>,
  ): void {
    const { agent_id, session_id, status, current_task_id, resource_usage } =
      frame.payload;

    const conn = this.connections.get(agent_id);
    if (!conn || conn.session_id !== session_id) {
      const errorFrame = createFrame(
        'error',
        { code: 'SESSION_EXPIRED', message: 'Session expired, please re-register' },
        frame.msg_id,
      );
      ws.send(serializeFrame(errorFrame));
      return;
    }

    // 更新连接状态
    conn.last_heartbeat_at = new Date().toISOString();
    conn.heartbeat_status = status;
    conn.current_task_id = current_task_id;

    // 回复心跳确认
    const ack = createFrame<AgentHeartbeatAckPayload>(
      'agent.heartbeat_ack',
      { received: true, server_time: new Date().toISOString() },
      frame.msg_id,
    );
    ws.send(serializeFrame(ack));

    this.emit('agent_heartbeat', { agent_id, status, current_task_id, resource_usage });
  }

  /**
   * 处理龙虾断开连接
   */
  handleDisconnect(agentId: string): void {
    this.sockets.delete(agentId);
    const conn = this.connections.get(agentId);
    if (conn) {
      this.connections.delete(agentId);
      this.emit('agent_disconnected', { agent_id: agentId, session_id: conn.session_id });
    }
  }

  /**
   * 向指定龙虾发送消息
   */
  sendToAgent(agentId: string, frame: MessageFrame): boolean {
    const ws = this.sockets.get(agentId);
    if (!ws || ws.readyState !== 1) return false;
    ws.send(serializeFrame(frame));
    return true;
  }

  /**
   * 向所有在线龙虾广播消息
   */
  broadcast(frame: MessageFrame): void {
    for (const [agentId, ws] of this.sockets.entries()) {
      if (ws.readyState === 1) {
        ws.send(serializeFrame(frame));
      }
    }
  }

  /**
   * 获取龙虾连接信息
   */
  getConnection(agentId: string): AgentConnection | undefined {
    return this.connections.get(agentId);
  }

  /**
   * 获取所有在线龙虾 ID
   */
  getOnlineAgentIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * 龙虾是否在线
   */
  isOnline(agentId: string): boolean {
    const ws = this.sockets.get(agentId);
    return !!ws && ws.readyState === 1;
  }

  /**
   * 更新龙虾的事件订阅模式
   */
  updateSubscriptions(agentId: string, patterns: string[]): void {
    const conn = this.connections.get(agentId);
    if (conn) {
      conn.subscribed_patterns = patterns;
    }
  }

  /**
   * 获取订阅了指定事件模式的龙虾
   */
  getSubscribedAgents(eventType: string): string[] {
    const result: string[] = [];
    for (const [agentId, conn] of this.connections.entries()) {
      for (const pattern of conn.subscribed_patterns) {
        if (matchEventPattern(eventType, pattern)) {
          result.push(agentId);
          break;
        }
      }
    }
    return result;
  }

  /**
   * 关闭所有连接
   */
  closeAll(): void {
    this.stopHeartbeatCheck();
    for (const ws of this.sockets.values()) {
      if (ws.readyState === 1) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.sockets.clear();
    this.connections.clear();
  }

  /**
   * 检查心跳超时
   */
  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [agentId, conn] of this.connections.entries()) {
      const elapsed = now - new Date(conn.last_heartbeat_at).getTime();
      if (elapsed > this.heartbeatTimeoutMs) {
        // 心跳超时，视为断连
        const ws = this.sockets.get(agentId);
        if (ws) {
          ws.close(4000, 'Heartbeat timeout');
        }
        this.handleDisconnect(agentId);
      }
    }
  }
}
