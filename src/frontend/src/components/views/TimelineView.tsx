// ============================================================
// TimelineView -- 时间线视图
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useClawStore } from '../../store';
import { api } from '../../api/client';
import { StatusDot } from '../shared/StatusDot';
import { Tooltip } from '../shared/Tooltip';
import type { Execution } from '../../types';

export const TimelineView: React.FC = () => {
  const workspaceId = useClawStore((s) => s.workspaceId);
  const getAgent = useClawStore((s) => s.getAgent);
  const [executions, setExecutions] = useState<Execution[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    api
      .getExecutions(workspaceId, { limit: '50' })
      .then((data) => setExecutions(data as Execution[]))
      .catch(() => {});
  }, [workspaceId]);

  // Find max duration for bar scaling
  const maxDuration = Math.max(
    ...executions.map((e) => e.duration_ms || 1000),
    1000,
  );

  return (
    <div className="w-full h-full overflow-y-auto p-4">
      {executions.length === 0 ? (
        <div className="text-xs text-ct-text-secondary text-center py-12">
          \u6682\u65E0\u6267\u884C\u8BB0\u5F55
        </div>
      ) : (
        <div className="space-y-1">
          {executions.map((exec) => {
            const agent = getAgent(exec.agent_id);
            const barWidth = Math.max(
              ((exec.duration_ms || 1000) / maxDuration) * 100,
              5,
            );

            return (
              <Tooltip
                key={exec.id}
                delay={200}
                position="right"
                content={
                  <div className="space-y-1 max-w-[200px]">
                    <div className="text-ct-text-primary font-medium">
                      {exec.input_preview?.slice(0, 40) || '\u4EFB\u52A1'}
                    </div>
                    <div className="text-ct-text-secondary">
                      {formatTime(exec.started_at)}
                      {exec.completed_at && ` \u2192 ${formatTime(exec.completed_at)}`}
                      {exec.duration_ms && ` ${Math.round(exec.duration_ms / 1000)}s`}
                    </div>
                    <div className="text-ct-text-secondary">
                      {exec.token_total
                        ? `${exec.token_total > 1000 ? `${(exec.token_total / 1000).toFixed(1)}K` : exec.token_total} tokens`
                        : ''}
                      {exec.tool_calls?.length
                        ? ` \uD83D\uDD27\u00D7${exec.tool_calls.length}`
                        : ''}
                    </div>
                  </div>
                }
              >
                <div className="flex items-center gap-2 py-0.5 group">
                  {/* Time */}
                  <span className="text-[10px] text-ct-text-secondary font-mono w-10 text-right shrink-0">
                    {formatTime(exec.started_at)}
                  </span>

                  {/* Agent emoji */}
                  <span className="text-sm shrink-0 w-5 text-center">
                    {agent?.emoji || '\u2753'}
                  </span>

                  {/* Bar */}
                  <div className="flex-1 h-5 relative">
                    <div
                      className={`h-full rounded-sm status-transition ${statusBarColor(exec.status)}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {/* Status dot */}
                  <StatusDot
                    status={exec.status}
                    size="sm"
                    pulse={exec.status === 'failed'}
                  />
                </div>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
};

function statusBarColor(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-ct-running/60';
    case 'completed':
      return 'bg-ct-success/60';
    case 'failed':
      return 'bg-ct-failed/60';
    case 'timeout':
      return 'bg-ct-waiting/60';
    default:
      return 'bg-ct-idle/60';
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}
