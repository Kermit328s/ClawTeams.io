// ============================================================
// ClawTeams WebSocket 客户端
// fire-and-forget 设计：发不出去就丢弃，不阻塞 OpenClaw
// ============================================================

import WebSocket from 'ws';
import { HookMessage } from './types';

export interface ClawTeamsClientConfig {
  serverUrl: string;   // e.g. "ws://localhost:3001/ws/hook"
  clawId: string;
}

export class ClawTeamsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectDelay: number = 30000;
  private baseReconnectDelay: number = 1000;
  private intentionalClose: boolean = false;

  constructor(private config: ClawTeamsClientConfig) {}

  /**
   * 建立 WebSocket 连接到 ClawTeams 后端。
   * 连接成功后自动发送 claw_online 消息。
   */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.createConnection();
  }

  /**
   * 断开 WebSocket 连接，不再重连。
   */
  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * fire-and-forget 发送消息。
   * 连接未就绪时静默丢弃，不抛异常。
   */
  send(msg: HookMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // fire-and-forget: 发送失败静默丢弃
    }
  }

  /**
   * 返回当前连接状态。
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ---- 内部方法 ----

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.config.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => this.onOpen());
    this.ws.on('close', () => this.onClose());
    this.ws.on('error', (err: Error) => this.onError(err));
  }

  private onOpen(): void {
    this.reconnectAttempts = 0;

    // 连接成功，自动上报 claw_online
    this.send({
      type: 'claw_online',
      payload: {
        claw_id: this.config.clawId,
        timestamp: Date.now(),
      },
    });
  }

  private onClose(): void {
    this.ws = null;

    if (!this.intentionalClose) {
      this.scheduleReconnect();
    }
  }

  private onError(_err: Error): void {
    // 错误后 WebSocket 会触发 close，重连在 onClose 中处理
    // 这里只是避免 unhandled error
  }

  /**
   * 指数退避重连。
   * delay = min(baseDelay * 2^attempts, maxDelay)
   */
  private scheduleReconnect(): void {
    if (this.intentionalClose) {
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createConnection();
    }, delay);
  }
}
