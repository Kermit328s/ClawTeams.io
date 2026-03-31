// ============================================================
// SkillCard -- 技能小卡片（"电视机"节点）
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SkillNodeData } from '../../types';
import { useClawStore } from '../../store';

function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1000000).toFixed(2)}M`;
}

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  idle: { color: '#475569', label: '等待' },
  running: { color: '#3B82F6', label: '执行中' },
  completed: { color: '#10B981', label: '完成' },
};

export const SkillCard: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as SkillNodeData;
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setDetailTarget = useClawStore((s) => s.setDetailTarget);

  const indicator = STATUS_INDICATOR[d.status] || STATUS_INDICATOR.idle;
  const stats = d.execution_stats;
  const hasArtifact = !!d.latest_artifact;

  const onEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setHovered(true), 100);
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
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'scale(1.04)' : 'scale(1)',
      }}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-ct-bg-tertiary !border-ct-text-secondary"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-ct-bg-tertiary !border-ct-text-secondary"
      />
      {/* 跨 Agent 连接也需要上下 Handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2 !h-2 !bg-ct-bg-tertiary !border-ct-text-secondary"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2 !h-2 !bg-ct-bg-tertiary !border-ct-text-secondary"
      />

      {/* 执行中呼吸光环 */}
      {d.status === 'running' && (
        <div
          className="absolute -inset-1.5 rounded-xl animate-pulse"
          style={{
            background: `radial-gradient(ellipse at center, ${d.agent_color}30, transparent 70%)`,
          }}
        />
      )}

      {/* 卡片主体 */}
      <div
        className={`relative rounded-xl cursor-pointer overflow-hidden ${
          selected ? 'ring-2 ring-ct-running ring-offset-1 ring-offset-ct-bg-primary' : ''
        }`}
        style={{
          width: 200,
          backgroundColor: '#0F172A',
          border: `2px solid ${hovered ? d.agent_color : '#334155'}`,
          boxShadow: hovered
            ? `0 0 20px ${d.agent_color}25, 0 4px 16px rgba(0,0,0,0.4)`
            : '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {/* 左侧色条 */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-l-xl"
          style={{
            width: 4,
            backgroundColor: d.agent_color,
          }}
        />

        {/* 上方：技能名 */}
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 pl-4">
          <span className="text-sm leading-none">{d.skill_icon}</span>
          <span className="text-xs font-semibold text-ct-text-primary truncate flex-1">
            {d.skill_name}
          </span>
          {/* 状态点 */}
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              d.status === 'running' ? 'animate-pulse' : ''
            }`}
            style={{ backgroundColor: indicator.color }}
          />
        </div>

        {/* 中间："电视屏幕"区域 */}
        <div className="mx-3 ml-4 mb-2" style={{ minHeight: 80 }}>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundColor: hasArtifact ? '#1E293B' : '#1A1F2E',
              border: '1px solid #334155',
              padding: '8px 10px',
              minHeight: 72,
            }}
          >
            {hasArtifact ? (
              // 有交付物：显示文件名 + 预览
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs">
                    {d.latest_artifact!.type === 'media' ? '🖼️' :
                     d.latest_artifact!.type === 'data' ? '📊' : '📄'}
                  </span>
                  <span className="text-[11px] font-medium text-ct-text-primary truncate">
                    {d.latest_artifact!.name}
                  </span>
                </div>
                <div className="text-[10px] text-ct-text-secondary leading-relaxed line-clamp-2">
                  {d.latest_artifact!.preview}
                </div>
                <div className="text-[9px] text-ct-text-secondary/60 mt-1.5">
                  {d.latest_artifact!.timestamp}
                </div>
              </div>
            ) : (
              // 无交付物：灰色屏幕
              <div className="flex flex-col items-center justify-center" style={{ minHeight: 56 }}>
                <div className="text-lg mb-1 opacity-30">📺</div>
                <span className="text-[10px] text-ct-text-secondary/40">等待执行...</span>
              </div>
            )}
          </div>
        </div>

        {/* 底部：执行统计 */}
        <div
          className="px-3 pl-4 pb-2 flex items-center justify-between"
          style={{ borderTop: '1px solid #1E293B' }}
        >
          <div className="flex items-center gap-2 text-[10px] text-ct-text-secondary">
            <span>
              执行: <span className="text-ct-text-primary font-medium">{stats.total}</span>次
            </span>
            {stats.succeeded > 0 && (
              <span className="text-ct-success">
                ✓{stats.succeeded}
              </span>
            )}
            {stats.failed > 0 && (
              <span className="text-ct-failed">
                ✗{stats.failed}
              </span>
            )}
          </div>
          <span className="text-[10px] text-ct-text-secondary/70 font-mono">
            {formatTokens(stats.tokens)}
          </span>
        </div>
      </div>
    </div>
  );
};
