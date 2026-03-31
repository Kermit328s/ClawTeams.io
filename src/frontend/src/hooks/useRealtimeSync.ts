// ============================================================
// WebSocket 连接 Hook
// ============================================================

import { useEffect, useRef } from 'react';
import { wsClient } from '../realtime/ws-client';
import { handleFrontendEvent } from '../realtime/event-handler';
import { useClawStore } from '../store/claw-store';

export function useRealtimeSync(): void {
  const setWsConnectionStatus = useClawStore((s) => s.setWsConnectionStatus);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const unsubEvent = wsClient.onEvent(handleFrontendEvent);
    const unsubStatus = wsClient.onStatus((status) => {
      setWsConnectionStatus(status);
    });

    wsClient.connect();

    return () => {
      unsubEvent();
      unsubStatus();
      wsClient.disconnect();
      initialized.current = false;
    };
  }, [setWsConnectionStatus]);
}
