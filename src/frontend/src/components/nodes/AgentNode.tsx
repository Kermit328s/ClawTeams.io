// ============================================================
// AgentNode -- React Flow 自定义 Agent 节点
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from '../../types';
import { useClawStore } from '../../store';

const STATUS_BG: Record<string, string> = {
  idle: '#1E293B',
  running: '#1E3A5F',
  failed: '#3B1A1A',
};

const STATUS_BORDER: Record<string, string> = {
  idle: '#334155',
  running: '#3B82F6',
  failed: '#EF4444',
};

export const AgentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as WorkflowNodeData;
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setDetailTarget = useClawStore((s) => s.setDetailTarget);
  const hoveredAgentId = useClawStore((s) => s.hoveredAgentId);

  const isHighlighted = hoveredAgentId === d.agent_id;
  const isDimmed = hoveredAgentId !== null && hoveredAgentId !== d.agent_id;

  const onEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setHovered(true), 200);
  }, []);

  const onLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHovered(false);
  }, []);

  const onClick = useCallback(() => {
    setDetailTarget({ type: 'agent', id: d.agent_id });
  }, [d.agent_id, setDetailTarget]);

  const size = hovered || isHighlighted ? 80 : 60;
  const bg = STATUS_BG[d.status] || STATUS_BG.idle;
  const border = STATUS_BORDER[d.status] || STATUS_BORDER.idle;

  return (
    <div
      className="relative status-transition"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        opacity: isDimmed ? 0.3 : 1,
        transition: 'opacity 0.3s ease, width 0.2s ease, height 0.2s ease',
      }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !bg-ct-bg-tertiary !border-ct-text-secondary" />
      <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5 !bg-ct-bg-tertiary !border-ct-text-secondary" />

      {/* Node body */}
      <div
        className={`flex items-center justify-center rounded-xl cursor-pointer status-transition ${
          d.has_file_change ? 'file-changed-border animate-pulse-3' : ''
        } ${d.status === 'failed' ? 'animate-slow-blink' : ''} ${
          selected ? 'ring-2 ring-ct-running' : ''
        }`}
        style={{
          width: size,
          height: size,
          backgroundColor: bg,
          border: `2px solid ${d.has_file_change ? '#8B5CF6' : border}`,
          borderStyle: d.has_file_change ? 'dashed' : 'solid',
          transition: 'all 0.2s ease',
        }}
      >
        <span
          className="select-none"
          style={{ fontSize: hovered || isHighlighted ? 32 : 24 }}
        >
          {d.emoji}
        </span>
      </div>

      {/* Layer 1: Hover tooltip */}
      {(hovered || isHighlighted) && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
          <div className="bg-ct-bg-tertiary border border-ct-bg-tertiary/80 rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
            <div className="text-xs font-medium text-ct-text-primary flex items-center gap-1">
              <span>{d.emoji}</span>
              <span>{d.name}</span>
            </div>
            {d.role && (
              <div className="text-[10px] text-ct-text-secondary mt-0.5">{d.role}</div>
            )}
            <div className="text-[10px] text-ct-text-secondary mt-1 flex items-center gap-2">
              <span>
                {'\u4ECA\u65E5'}: {d.execution_stats.today_total}{'\u6B21'}
              </span>
              {d.execution_stats.today_succeeded > 0 && (
                <span className="text-ct-success">
                  {'\u2713'}{d.execution_stats.today_succeeded}
                </span>
              )}
              {d.execution_stats.today_failed > 0 && (
                <span className="text-ct-failed">
                  {'\u2717'}{d.execution_stats.today_failed}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
