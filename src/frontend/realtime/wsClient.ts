/**
 * WebSocket client for connecting to the ClawTeams event bus.
 * Handles connection, reconnection, and event dispatching.
 */

import type { ClawTeamsEvent, EventType } from '@shared/events';

export type WsConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

type EventCallback = (event: ClawTeamsEvent) => void;

interface WsClientOptions {
  /** WebSocket URL */
  url: string;
  /** Reconnect delay in ms (default 3000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default 10) */
  maxReconnectAttempts?: number;
  /** Called on connection state change */
  onStateChange?: (state: WsConnectionState) => void;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private options: Required<WsClientOptions>;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private wildcardListeners: Set<EventCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: WsConnectionState = 'disconnected';

  constructor(opts: WsClientOptions) {
    this.options = {
      reconnectDelay: 3000,
      maxReconnectAttempts: 10,
      onStateChange: () => {},
      ...opts,
    };
  }

  get state(): WsConnectionState {
    return this._state;
  }

  private setState(state: WsConnectionState) {
    this._state = state;
    this.options.onStateChange(state);
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.options.url);

      this.ws.onopen = () => {
        this.setState('connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed: ClawTeamsEvent = JSON.parse(event.data);
          this.dispatch(parsed);
        } catch {
          console.warn('[WsClient] Failed to parse event:', event.data);
        }
      };

      this.ws.onerror = () => {
        this.setState('error');
      };

      this.ws.onclose = () => {
        this.setState('disconnected');
        this.attemptReconnect();
      };
    } catch {
      this.setState('error');
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.options.maxReconnectAttempts; // prevent reconnect
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
  }

  /**
   * Subscribe to a specific event type or use '*' for all events.
   * Pattern supports domain-level matching: 'task.*' matches all task events.
   */
  subscribe(pattern: string, callback: EventCallback): () => void {
    if (pattern === '*') {
      this.wildcardListeners.add(callback);
      return () => this.wildcardListeners.delete(callback);
    }

    if (!this.listeners.has(pattern)) {
      this.listeners.set(pattern, new Set());
    }
    this.listeners.get(pattern)!.add(callback);

    return () => {
      this.listeners.get(pattern)?.delete(callback);
    };
  }

  private dispatch(event: ClawTeamsEvent): void {
    // Exact match
    const exactListeners = this.listeners.get(event.event_type);
    if (exactListeners) {
      for (const cb of exactListeners) cb(event);
    }

    // Domain wildcard match (e.g., "task.*")
    const domain = event.event_type.split('.')[0];
    const domainWildcard = `${domain}.*`;
    const domainListeners = this.listeners.get(domainWildcard);
    if (domainListeners) {
      for (const cb of domainListeners) cb(event);
    }

    // Wildcard listeners
    for (const cb of this.wildcardListeners) cb(event);
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.warn('[WsClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay * Math.min(this.reconnectAttempts, 5);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
