/**
 * React hook that manages the WebSocket connection lifecycle
 * and wires incoming events to stores via event handlers.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { WsClient, type WsConnectionState } from './wsClient';
import { handleEvent } from './eventHandlers';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function useRealtimeSync() {
  const clientRef = useRef<WsClient | null>(null);
  const [connectionState, setConnectionState] = useState<WsConnectionState>('disconnected');

  const connect = useCallback(() => {
    if (clientRef.current) return;

    const client = new WsClient({
      url: WS_URL,
      reconnectDelay: 3000,
      maxReconnectAttempts: 10,
      onStateChange: setConnectionState,
    });

    client.subscribe('*', handleEvent);
    client.connect();
    clientRef.current = client;
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { connectionState, connect, disconnect };
}
