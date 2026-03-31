// ============================================================
// 状态色点组件
// ============================================================

import React from 'react';
import type { AgentStatus, ClawStatus, ExecutionStatus } from '../../types';

type Status = AgentStatus | ClawStatus | ExecutionStatus | string;

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-ct-idle',
  online: 'bg-ct-success',
  offline: 'bg-ct-failed',
  running: 'bg-ct-running',
  completed: 'bg-ct-success',
  success: 'bg-ct-success',
  failed: 'bg-ct-failed',
  timeout: 'bg-ct-waiting',
  waiting: 'bg-ct-waiting',
  changed: 'bg-ct-changed',
};

const STATUS_EMOJI: Record<string, string> = {
  idle: '\u26AA',
  online: '\uD83D\uDFE2',
  offline: '\uD83D\uDD34',
  running: '\uD83D\uDD35',
  completed: '\uD83D\uDFE2',
  success: '\uD83D\uDFE2',
  failed: '\uD83D\uDD34',
  timeout: '\uD83D\uDFE1',
  waiting: '\uD83D\uDFE1',
  changed: '\uD83D\uDFE3',
};

interface StatusDotProps {
  status: Status;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  useEmoji?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'sm',
  pulse = false,
  useEmoji = false,
}) => {
  if (useEmoji) {
    return (
      <span className={size === 'lg' ? 'text-base' : size === 'md' ? 'text-sm' : 'text-xs'}>
        {STATUS_EMOJI[status] || '\u26AA'}
      </span>
    );
  }

  const sizeClass = size === 'lg' ? 'w-3 h-3' : size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const colorClass = STATUS_COLORS[status] || 'bg-ct-idle';

  return (
    <span
      className={`inline-block rounded-full status-transition ${sizeClass} ${colorClass} ${
        pulse ? 'animate-slow-blink' : ''
      }`}
    />
  );
};
