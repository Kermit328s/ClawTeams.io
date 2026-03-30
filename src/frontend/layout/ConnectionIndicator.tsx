import React from 'react';
import clsx from 'clsx';
import type { WsConnectionState } from '@/realtime/wsClient';

interface ConnectionIndicatorProps {
  state: WsConnectionState;
}

const stateConfig: Record<WsConnectionState, { color: string; label: string }> = {
  connected: { color: 'bg-claw-success', label: '已连接' },
  connecting: { color: 'bg-claw-warning animate-pulse', label: '连接中' },
  disconnected: { color: 'bg-claw-muted', label: '未连接' },
  error: { color: 'bg-claw-danger', label: '连接错误' },
};

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  state,
}) => {
  const config = stateConfig[state];

  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx('w-1.5 h-1.5 rounded-full', config.color)} />
      <span className="text-[10px] text-claw-muted">{config.label}</span>
    </div>
  );
};
