// ============================================================
// AgentNode -- React Flow 自定义 Agent 节点（信息丰富 + 动态版）
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from '../../types';
import { useClawStore } from '../../store';

const STATUS_COLORS: Record<string, { bg: string; border: string; glow: string; label: string }> = {
  idle: { bg: '#1E293B', border: '#475569', glow: 'transparent', label: '空闲' },
  running: { bg: '#0F2847', border: '#3B82F6', glow: '#3B82F640', label: '执行中' },
  failed: { bg: '#3B1A1A', border: '#EF4444', glow: '#EF444440', label: '失败' },
};

// 模拟动态数据（实际应从 store 获取）
function useElapsedTime(status: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== 'running') { setElapsed(0); return; }
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);
  return elapsed;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1000000).toFixed(2)}M`;
}

export const AgentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as WorkflowNodeData;
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setDetailTarget = useClawStore((s) => s.setDetailTarget);
  const hoveredAgentId = useClawStore((s) => s.hoveredAgentId);
  const elapsed = useElapsedTime(d.status);

  const isHighlighted = hoveredAgentId === d.agent_id;
  const isDimmed = hoveredAgentId !== null && hoveredAgentId !== d.agent_id;
  const isActive = hovered || isHighlighted;
  const colors = STATUS_COLORS[d.status] || STATUS_COLORS.idle;
  const stats = d.execution_stats;
  const hasActivity = stats.today_total > 0;
  const successRate = stats.today_total > 0 ? Math.round((stats.today_succeeded / stats.today_total) * 100) : 0;

  const onEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setHovered(true), 150);
  }, []);
  const onLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHovered(false);
  }, []);
  const onClick = useCallback(() => {
    setDetailTarget({ type: 'agent', id: d.agent_id });
  }, [d.agent_id, setDetailTarget]);

  return (
    <div
      className="relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        opacity: isDimmed ? 0.2 : 1,
        transition: 'opacity 0.3s ease, transform 0.2s ease',
        transform: isActive ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-ct-bg-tertiary !border-ct-text-secondary" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-ct-bg-tertiary !border-ct-text-secondary" />

      {/* 呼吸光环（执行中） */}
      {d.status === 'running' && (
        <div
          className="absolute -inset-2 rounded-2xl animate-pulse"
          style={{
            background: `radial-gradient(ellipse at center, ${colors.glow}, transparent 70%)`,
          }}
        />
      )}

      {/* 节点卡片 */}
      <div
        className={`relative rounded-xl cursor-pointer overflow-hidden ${
          d.status === 'failed' ? 'animate-slow-blink' : ''
        } ${selected ? 'ring-2 ring-ct-running ring-offset-1 ring-offset-ct-bg-primary' : ''}`}
        style={{
          width: 240,
          backgroundColor: colors.bg,
          border: `2px solid ${d.has_file_change ? '#8B5CF6' : colors.border}`,
          borderStyle: d.has_file_change ? 'dashed' : 'solid',
          boxShadow: isActive
            ? `0 0 30px ${colors.glow}, 0 4px 20px rgba(0,0,0,0.5)`
            : `0 2px 8px rgba(0,0,0,0.3)`,
          transition: 'box-shadow 0.3s ease',
        }}
      >
        {/* ── 顶部：身份行 ── */}
        <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5">
          <div className="relative">
            <span className="text-3xl leading-none">{d.emoji || '🤖'}</span>
            {/* 状态指示灯 */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-ct-bg-secondary ${
                d.status === 'running' ? 'animate-pulse' : ''
              }`}
              style={{ backgroundColor: colors.border }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-ct-text-primary truncate">{d.name}</div>
            <div className="text-xs text-ct-text-secondary truncate">{d.role || d.model}</div>
          </div>
        </div>

        {/* ── 当前状态区 ── */}
        <div className="px-3 py-1.5 mx-2 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
          {d.status === 'running' ? (
            <div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-ct-running animate-pulse" />
                <span className="text-sm text-ct-running font-medium truncate">
                  {d.current_task || '执行中...'}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-ct-text-secondary">⏱ {formatDuration(elapsed)}</span>
                {/* 进度条动画 */}
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ct-running rounded-full"
                    style={{
                      animation: 'progressPulse 2s ease-in-out infinite',
                      width: '60%',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : d.status === 'failed' ? (
            <div>
              <div className="text-sm text-ct-failed font-medium">
                ✗ {d.error_message || '执行失败'}
              </div>
              <div className="text-xs text-ct-text-secondary mt-0.5">最近失败</div>
            </div>
          ) : (
            <div className="text-sm text-ct-text-secondary">
              {d.last_execution ? `最近: ${d.last_execution}` : '等待任务...'}
            </div>
          )}
        </div>

        {/* ── 统计行 ── */}
        <div className="px-3 py-1.5">
          {hasActivity ? (
            <div className="space-y-1.5">
              {/* 第一行：执行次数 + 成功/失败 + 成功率 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-ct-text-secondary">今日</span>
                  <span className="text-sm font-bold text-ct-text-primary">{stats.today_total}</span>
                  <span className="text-xs text-ct-text-secondary">次</span>
                  {stats.today_succeeded > 0 && (
                    <span className="text-xs text-ct-success font-medium">✓{stats.today_succeeded}</span>
                  )}
                  {stats.today_failed > 0 && (
                    <span className="text-xs text-ct-failed font-medium">✗{stats.today_failed}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-10 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${successRate}%`,
                        backgroundColor: successRate >= 80 ? '#10B981' : successRate >= 50 ? '#F59E0B' : '#EF4444',
                      }}
                    />
                  </div>
                  <span className="text-xs text-ct-text-secondary">{successRate}%</span>
                </div>
              </div>

              {/* 第二行：Token 用量 */}
              <div className="flex items-center justify-between text-xs" style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '3px 8px' }}>
                <div className="flex items-center gap-1">
                  <span className="text-ct-text-secondary">🪙 今日</span>
                  <span className="font-mono font-bold text-ct-text-primary">
                    {formatTokens(stats.today_tokens || 0)}
                  </span>
                </div>
                <div className="w-px h-3 bg-white/10" />
                <div className="flex items-center gap-1">
                  <span className="text-ct-text-secondary">10min</span>
                  <span className={`font-mono font-bold ${(stats.recent_10min_tokens || 0) > 0 ? 'text-ct-running' : 'text-ct-text-secondary/50'}`}>
                    {formatTokens(stats.recent_10min_tokens || 0)}
                  </span>
                  {(stats.recent_10min_tokens || 0) > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-ct-running animate-pulse" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-xs text-ct-text-secondary/50">今日无执行</span>
          )}
        </div>

        {/* ── 最近产出条（如有） ── */}
        {d.last_artifact && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-1 text-xs text-ct-text-secondary bg-white/5 rounded px-1.5 py-0.5">
              <span>📄</span>
              <span className="truncate">{d.last_artifact}</span>
            </div>
          </div>
        )}

        {/* 文件变更角标 */}
        {d.has_file_change && (
          <div className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-ct-changed text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-lg">
            <span>🟣</span>
            <span>更新</span>
          </div>
        )}

        {/* 横切角色标记 */}
        {d.is_crosscut && (
          <div className="absolute -top-1.5 -left-1.5 bg-amber-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-lg">
            横切
          </div>
        )}
      </div>

      {/* ── 悬停展开面板 ── */}
      {isActive && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none">
          <div className="bg-ct-bg-secondary/95 backdrop-blur border border-ct-bg-tertiary rounded-xl px-4 py-3 shadow-2xl min-w-[240px]">
            <div className="text-[11px] space-y-1.5">
              <div className="flex justify-between text-ct-text-secondary">
                <span>模型</span>
                <span className="text-ct-text-primary font-mono text-[10px]">{d.model}</span>
              </div>
              <div className="flex justify-between text-ct-text-secondary">
                <span>Agent ID</span>
                <span className="text-ct-text-primary font-mono text-[10px]">{d.agent_id}</span>
              </div>
              {d.is_crosscut && (
                <div className="flex justify-between text-ct-text-secondary">
                  <span>角色类型</span>
                  <span className="text-amber-400 font-medium">横切治理</span>
                </div>
              )}
              {hasActivity && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <div className="flex justify-between text-ct-text-secondary">
                    <span>今日执行</span>
                    <span className="text-ct-text-primary">{stats.today_total} 次</span>
                  </div>
                  <div className="flex justify-between text-ct-text-secondary">
                    <span>成功率</span>
                    <span style={{ color: successRate >= 80 ? '#10B981' : successRate >= 50 ? '#F59E0B' : '#EF4444' }}>
                      {successRate}%
                    </span>
                  </div>
                </>
              )}
              <div className="border-t border-white/10 my-1" />
              <div className="text-xs text-ct-text-secondary/70 text-center">点击查看完整详情</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
