// ============================================================
// TopBar -- 工作空间名 + 连接状态
// ============================================================

import React from 'react';
import { useClawStore } from '../../store';
import { StatusDot } from '../shared/StatusDot';

export const TopBar: React.FC = () => {
  const claws = useClawStore((s) => s.claws);
  const wsStatus = useClawStore((s) => s.wsConnectionStatus);

  const hasOfflineClaw = claws.some((c) => c.status === 'offline');
  const allOnline = claws.length > 0 && claws.every((c) => c.status === 'online');

  return (
    <div className="h-10 bg-ct-bg-secondary border-b border-ct-bg-tertiary flex items-center justify-between px-4 shrink-0">
      {/* Left: workspace name + claw status */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-ct-text-primary">ClawTeams</span>
        <span className="text-ct-text-secondary text-xs">|</span>
        {claws.map((claw) => (
          <div key={claw.claw_id} className="flex items-center gap-1.5">
            <span className="text-sm">{'\uD83E\uDD9E'}</span>
            <span className="text-xs text-ct-text-secondary">{claw.name}</span>
            <StatusDot
              status={claw.status}
              size="sm"
              pulse={claw.status === 'offline'}
            />
          </div>
        ))}
        {claws.length === 0 && (
          <span className="text-xs text-ct-text-secondary">\u6682\u65E0\u9F99\u867E</span>
        )}
      </div>

      {/* Right: WebSocket connection status */}
      <div className="flex items-center gap-2">
        {hasOfflineClaw && (
          <span className="text-xs text-ct-failed animate-slow-blink">
            \u9F99\u867E\u79BB\u7EBF
          </span>
        )}
        <div className="flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsStatus === 'connected'
                ? 'bg-ct-success'
                : wsStatus === 'connecting'
                ? 'bg-ct-waiting animate-pulse'
                : 'bg-ct-failed'
            }`}
          />
          <span className="text-[10px] text-ct-text-secondary">
            {wsStatus === 'connected' ? 'WS' : wsStatus === 'connecting' ? '...' : '\u2716'}
          </span>
        </div>
      </div>
    </div>
  );
};
