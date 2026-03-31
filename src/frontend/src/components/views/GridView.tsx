// ============================================================
// GridView -- Agent x 日期矩阵
// ============================================================

import React, { useEffect, useState } from 'react';
import { useClawStore } from '../../store';
import { api } from '../../api/client';
import { Tooltip } from '../shared/Tooltip';
import type { Execution, Agent } from '../../types';

export const GridView: React.FC = () => {
  const workspaceId = useClawStore((s) => s.workspaceId);
  const agents = useClawStore((s) => s.getAllAgents());
  const [executions, setExecutions] = useState<Execution[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    api
      .getExecutions(workspaceId, { limit: '200' })
      .then((data) => setExecutions(data as Execution[]))
      .catch(() => {});
  }, [workspaceId]);

  // Group executions by agent and date
  const dates = getRecentDates(7);
  const grid = buildGrid(agents, executions, dates);

  return (
    <div className="w-full h-full overflow-auto p-4">
      {agents.length === 0 ? (
        <div className="text-xs text-ct-text-secondary text-center py-12">
          \u6682\u65E0 Agent \u6570\u636E
        </div>
      ) : (
        <div className="inline-block min-w-full">
          {/* Date headers */}
          <div className="flex items-center gap-1 mb-2">
            <div className="w-10 shrink-0" />
            {dates.map((date) => (
              <div
                key={date}
                className="w-16 shrink-0 text-center text-[10px] text-ct-text-secondary"
              >
                {formatShortDate(date)}
              </div>
            ))}
          </div>

          {/* Agent rows */}
          {agents.map((agent) => (
            <div key={agent.agent_id} className="flex items-center gap-1 mb-1">
              <div className="w-10 shrink-0 text-center text-sm">{agent.emoji}</div>
              {dates.map((date) => {
                const cells = grid[agent.agent_id]?.[date] || [];
                return (
                  <div
                    key={date}
                    className="w-16 shrink-0 flex items-center justify-center gap-0.5 flex-wrap py-0.5"
                  >
                    {cells.length === 0 ? (
                      <span className="text-[10px] text-ct-text-secondary">\u2014</span>
                    ) : (
                      cells.slice(0, 6).map((exec, i) => (
                        <Tooltip
                          key={i}
                          delay={200}
                          content={
                            <div className="max-w-[180px]">
                              <div className="text-ct-text-primary">
                                {exec.input_preview?.slice(0, 30) || '\u4EFB\u52A1'}
                              </div>
                              <div className="text-ct-text-secondary">
                                {formatTime(exec.started_at)}
                                {exec.duration_ms && ` ${Math.round(exec.duration_ms / 1000)}s`}
                              </div>
                            </div>
                          }
                        >
                          <span
                            className={`text-xs cursor-default ${
                              exec.status === 'completed' || exec.status === 'running'
                                ? 'text-ct-success'
                                : 'text-ct-failed'
                            }`}
                          >
                            {exec.status === 'completed' || exec.status === 'running'
                              ? '\u25CF'
                              : '\u25CB'}
                          </span>
                        </Tooltip>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Helpers ----

function getRecentDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function buildGrid(
  agents: Agent[],
  executions: Execution[],
  dates: string[],
): Record<string, Record<string, Execution[]>> {
  const grid: Record<string, Record<string, Execution[]>> = {};
  for (const agent of agents) {
    grid[agent.agent_id] = {};
    for (const date of dates) {
      grid[agent.agent_id][date] = [];
    }
  }
  for (const exec of executions) {
    const date = exec.started_at?.slice(0, 10);
    if (grid[exec.agent_id]?.[date]) {
      grid[exec.agent_id][date].push(exec);
    }
  }
  return grid;
}

function formatShortDate(iso: string): string {
  const parts = iso.split('-');
  return `${parts[1]}/${parts[2]}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}
