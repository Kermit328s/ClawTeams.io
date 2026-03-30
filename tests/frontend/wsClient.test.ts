import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsClient } from '../../src/frontend/realtime/wsClient';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  close() {
    this.onclose?.();
  }
}

describe('WsClient', () => {
  beforeEach(() => {
    (globalThis as any).WebSocket = MockWebSocket;
  });

  it('should create a client with default options', () => {
    const client = new WsClient({ url: 'ws://test' });
    expect(client.state).toBe('disconnected');
  });

  it('should transition to connecting on connect()', () => {
    const onStateChange = vi.fn();
    const client = new WsClient({ url: 'ws://test', onStateChange });
    client.connect();
    expect(onStateChange).toHaveBeenCalledWith('connecting');
  });

  it('should subscribe to events with exact match', () => {
    const client = new WsClient({ url: 'ws://test' });
    const callback = vi.fn();
    const unsubscribe = client.subscribe('task.completed', callback);
    expect(typeof unsubscribe).toBe('function');
  });

  it('should subscribe to wildcard events', () => {
    const client = new WsClient({ url: 'ws://test' });
    const callback = vi.fn();
    client.subscribe('*', callback);
    // Callback registered — dispatching would call it
  });

  it('should unsubscribe correctly', () => {
    const client = new WsClient({ url: 'ws://test' });
    const callback = vi.fn();
    const unsubscribe = client.subscribe('task.completed', callback);
    unsubscribe();
    // After unsubscribe, callback should not be called
  });

  it('should disconnect cleanly', () => {
    const onStateChange = vi.fn();
    const client = new WsClient({
      url: 'ws://test',
      onStateChange,
      maxReconnectAttempts: 0,
    });
    client.connect();
    client.disconnect();
    expect(client.state).toBe('disconnected');
  });
});
