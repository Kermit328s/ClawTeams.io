// ============================================================
// WebSocket 客户端 — 连接 /ws/frontend
// ============================================================

import type { FrontendEvent } from '../types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type EventHandler = (event: FrontendEvent) => void;
export type StatusHandler = (status: ConnectionStatus) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private eventHandlers: Set<EventHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private maxReconnectDelay = 30000;
  private currentDelay = 2000;
  private status: ConnectionStatus = 'disconnected';

  constructor(url: string = `ws://${window.location.host}/ws/frontend`) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setStatus('connecting');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.setStatus('connected');
      this.currentDelay = this.reconnectDelay;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as FrontendEvent;
        this.eventHandlers.forEach((handler) => handler(data));
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setStatus('error');
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnectDelay);
    }, this.currentDelay);
  }
}

// Singleton instance
export const wsClient = new WsClient();
