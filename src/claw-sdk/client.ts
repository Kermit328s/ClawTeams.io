/**
 * ClawSDK 客户端
 *
 * 龙虾端 SDK，封装与团队大脑的通信协议：
 * - WebSocket 连接管理
 * - 注册握手
 * - 心跳发送
 * - 任务状态上报
 * - 事件订阅
 * - 断线自动重连
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import os from 'os';
import type {
  ClawSDKConfig,
  ConnectionState,
  MessageType,
  MessageFrame,
  AgentCapability,
  AgentRuntime,
  AgentHeartbeatStatus,
  AgentResourceUsage,
  TaskReportState,
  TaskAssignment,
  ClawTeamsEvent,
  TaskHandler,
  EventHandler,
  StateChangeHandler,
} from './types';

// ─── 内部 payload 类型（消除 as any） ───
interface RegisterAckPayload {
  success: boolean;
  session_id: string;
  error?: string;
}

interface SubscribeAckPayload {
  subscribed_patterns: string[];
}

interface TaskAssignPayload {
  task_id: string;
  task_type: string;
  input: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  deadline: string;
  context?: Record<string, unknown>;
}

interface EventPushPayload {
  event: ClawTeamsEvent;
}

interface ErrorPayload {
  code: string;
  message: string;
}

export class ClawClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private state: ConnectionState = 'disconnected';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  private readonly config: Required<
    Pick<ClawSDKConfig, 'serverUrl' | 'agentId' | 'apiKey' | 'capabilities'>
  > &
    ClawSDKConfig;

  // 回调
  private taskHandler: TaskHandler | null = null;
  private eventHandlers = new Map<string, EventHandler[]>();
  private stateChangeHandlers: StateChangeHandler[] = [];

  // 请求-响应追踪
  private pendingRequests = new Map<
    string,
    { resolve: (value: MessageFrame) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(config: ClawSDKConfig) {
    this.config = {
      heartbeatIntervalMs: 30_000,
      autoReconnect: true,
      reconnect: {
        initialMs: 1000,
        maxMs: 30000,
        multiplier: 2,
      },
      ...config,
    };
  }

  // ─── 公开 API ───

  /**
   * 连接到团队大脑并完成注册
   */
  async connect(): Promise<void> {
    this.intentionallyClosed = false;
    this.reconnectAttempt = 0;

    return this.doConnect();
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.intentionallyClosed = true;
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /**
   * 上报任务状态
   */
  async reportTask(params: {
    taskId: string;
    state: TaskReportState;
    progressPercent?: number;
    stateUnit?: unknown;
    error?: { code: string; message: string; retryable: boolean };
  }): Promise<void> {
    this.ensureRegistered();

    const frame = this.createFrame('task.report', {
      task_id: params.taskId,
      agent_id: this.config.agentId,
      state: params.state,
      progress_percent: params.progressPercent,
      state_unit: params.stateUnit,
      error: params.error,
    });

    this.send(frame);
  }

  /**
   * 订阅事件
   * @param patterns 事件类型模式列表（如 ["task.*", "workflow.completed"]）
   */
  async subscribe(patterns: string[]): Promise<string[]> {
    this.ensureRegistered();

    const frame = this.createFrame('event.subscribe', {
      agent_id: this.config.agentId,
      event_patterns: patterns,
    });

    const response = await this.sendAndWait(frame, 10_000);
    return (response.payload as SubscribeAckPayload).subscribed_patterns ?? patterns;
  }

  /**
   * 注册任务处理器
   * 当大脑下发任务时会调用此回调
   */
  onTask(handler: TaskHandler): void {
    this.taskHandler = handler;
  }

  /**
   * 注册事件处理器
   * @param pattern 事件类型模式
   * @param handler 处理回调
   */
  onEvent(pattern: string, handler: EventHandler): () => void {
    const handlers = this.eventHandlers.get(pattern) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(pattern, handlers);

    return () => {
      const list = this.eventHandlers.get(pattern);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  /**
   * 监听连接状态变化
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.push(handler);
    return () => {
      const idx = this.stateChangeHandlers.indexOf(handler);
      if (idx !== -1) this.stateChangeHandlers.splice(idx, 1);
    };
  }

  /**
   * 获取当前连接状态
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  // ─── 内部实现 ───

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');

      try {
        this.ws = new WebSocket(this.config.serverUrl);
      } catch (err) {
        this.setState('disconnected');
        reject(err);
        return;
      }

      const onOpen = async () => {
        this.ws?.removeListener('error', onError);
        try {
          await this.register();
          this.startHeartbeat();
          this.reconnectAttempt = 0;
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      const onError = (err: Error) => {
        this.ws?.removeListener('open', onOpen);
        this.setState('disconnected');
        reject(err);
      };

      this.ws.once('open', onOpen);
      this.ws.once('error', onError);

      this.ws.on('message', (data: Buffer | string) => {
        const raw = typeof data === 'string' ? data : data.toString('utf-8');
        this.handleMessage(raw);
      });

      this.ws.on('close', () => {
        this.cleanup();
        if (!this.intentionallyClosed && this.config.autoReconnect) {
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      });

      this.ws.on('error', () => {
        // 错误后 close 事件会触发重连
      });
    });
  }

  private async register(): Promise<void> {
    const runtime = this.config.runtime ?? this.detectRuntime();

    const frame = this.createFrame('agent.register', {
      agent_id: this.config.agentId,
      api_key: this.config.apiKey,
      capabilities: this.config.capabilities,
      runtime,
    });

    const response = await this.sendAndWait(frame, 10_000);
    const payload = response.payload as RegisterAckPayload;

    if (!payload.success) {
      throw new Error(`Registration failed: ${payload.error ?? 'Unknown error'}`);
    }

    this.sessionId = payload.session_id;
    this.setState('registered');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'registered' && this.ws?.readyState === WebSocket.OPEN) {
        const frame = this.createFrame('agent.heartbeat', {
          agent_id: this.config.agentId,
          session_id: this.sessionId,
          status: 'idle' as AgentHeartbeatStatus,
        });
        this.send(frame);
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    const { initialMs = 1000, maxMs = 30000, multiplier = 2 } =
      this.config.reconnect ?? {};

    const delay = Math.min(
      initialMs * Math.pow(multiplier, this.reconnectAttempt),
      maxMs,
    );
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const waitMs = Math.max(0, Math.floor(delay + jitter));

    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.doConnect();
      } catch {
        // doConnect 内部的 close 事件会再次触发 scheduleReconnect
      }
    }, waitMs);
  }

  private handleMessage(raw: string): void {
    let frame: MessageFrame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    // 检查是否是某个请求的响应
    if (frame.reply_to) {
      const pending = this.pendingRequests.get(frame.reply_to);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(frame.reply_to);
        pending.resolve(frame);
        return;
      }
    }

    // 按类型分发
    switch (frame.msg_type) {
      case 'task.assign':
        this.handleTaskAssign(frame);
        break;
      case 'event.push':
        this.handleEventPush(frame);
        break;
      case 'error':
        this.handleError(frame);
        break;
    }
  }

  private async handleTaskAssign(frame: MessageFrame): Promise<void> {
    if (!this.taskHandler) return;

    const payload = frame.payload as TaskAssignPayload;
    const task: TaskAssignment = {
      task_id: payload.task_id,
      task_type: payload.task_type,
      input: payload.input,
      priority: payload.priority,
      deadline: payload.deadline,
      context: payload.context,
    };

    try {
      await this.taskHandler(task);
    } catch (err) {
      // 任务处理失败，上报 failed
      await this.reportTask({
        taskId: task.task_id,
        state: 'failed',
        error: {
          code: 'HANDLER_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        },
      });
    }
  }

  private async handleEventPush(frame: MessageFrame): Promise<void> {
    const payload = frame.payload as EventPushPayload;
    const event: ClawTeamsEvent = payload.event;
    if (!event) return;

    for (const [pattern, handlers] of this.eventHandlers) {
      if (this.matchPattern(event.event_type, pattern)) {
        for (const handler of handlers) {
          try {
            await handler(event);
          } catch {
            // 忽略处理器错误
          }
        }
      }
    }
  }

  private handleError(frame: MessageFrame): void {
    const payload = frame.payload as ErrorPayload;
    if (payload.code === 'SESSION_EXPIRED') {
      // 会话过期，需要重新注册
      this.sessionId = null;
      this.cleanup();
      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private send(frame: MessageFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private sendAndWait(frame: MessageFrame, timeoutMs: number): Promise<MessageFrame> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(frame.msg_id);
        reject(new Error(`Request timeout: ${frame.msg_type}`));
      }, timeoutMs);

      this.pendingRequests.set(frame.msg_id, { resolve, reject, timer });
      this.send(frame);
    });
  }

  private createFrame<T>(msgType: string, payload: T): MessageFrame<T> {
    return {
      msg_type: msgType as MessageType,
      msg_id: randomUUID(),
      timestamp: new Date().toISOString(),
      payload,
    };
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const handler of this.stateChangeHandlers) {
      try {
        handler(newState);
      } catch {
        // 忽略
      }
    }
  }

  private ensureRegistered(): void {
    if (this.state !== 'registered') {
      throw new Error(
        `Cannot perform operation in state "${this.state}". Call connect() first.`,
      );
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // 清理所有挂起请求
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  private detectRuntime(): AgentRuntime {
    return {
      hostname: os.hostname(),
      platform: `${os.platform()}-${os.arch()}`,
      memory_mb: Math.floor(os.totalmem() / (1024 * 1024)),
      cpu_cores: os.cpus().length,
    };
  }

  private matchPattern(eventType: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;
    if (pattern.endsWith('.*')) {
      return eventType.startsWith(pattern.slice(0, -2) + '.');
    }
    if (pattern.startsWith('*.')) {
      return eventType.endsWith('.' + pattern.slice(2));
    }
    return false;
  }
}
