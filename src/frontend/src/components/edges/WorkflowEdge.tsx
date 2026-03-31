// ============================================================
// WorkflowEdge -- React Flow 自定义边（技能级版 — 三种样式）
// ============================================================
//
// 边类型：
//   internal    — 同一 Agent 内技能之间：细线、统一颜色、无标签
//   cross_agent — 跨 Agent 交付：粗线、带标签、有流动粒子
//   crosscut    — Redteam 横切：虚线、红色调
//   其他旧类型兼容

import React, { useState, useCallback, useRef } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { WorkflowEdgeData, EdgeType } from '../../types';

const EDGE_COLORS: Record<string, string> = {
  internal: '#475569',
  cross_agent: '#818CF8',
  crosscut: '#EF4444',
  collaboration: '#818CF8',
  subagent: '#FBBF24',
  data_flow: '#34D399',
  sequence: '#64748B',
};

const EDGE_WIDTHS: Record<string, number> = {
  internal: 1.5,
  cross_agent: 3,
  crosscut: 2,
  collaboration: 2,
  subagent: 2,
  data_flow: 1.5,
  sequence: 1,
};

export const CustomWorkflowEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  ...rest
}) => {
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeData = data as WorkflowEdgeData | undefined;

  const edgeType = ((rest as Record<string, unknown>).type as string) || 'sequence';
  const color = EDGE_COLORS[edgeType] || EDGE_COLORS.sequence;
  const baseWidth = EDGE_WIDTHS[edgeType] || 1.5;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const onEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setHovered(true), 100);
  }, []);
  const onLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHovered(false);
  }, []);

  const label = edgeData?.label || '';
  const strength = edgeData?.strength || 0;

  // 内部边：简化显示
  const isInternal = edgeType === 'internal';
  const isCrossAgent = edgeType === 'cross_agent';
  const isCrosscut = edgeType === 'crosscut';

  // 虚线样式
  const dashArray = isCrosscut ? '6 4' : '';

  return (
    <>
      {/* Hover 检测区域 */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{ cursor: 'pointer' }}
      />

      {/* 跨 Agent 边发光效果 */}
      {isCrossAgent && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: baseWidth + 4,
            opacity: 0.12,
            filter: 'blur(4px)',
          }}
        />
      )}

      {/* 主边线 */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: hovered ? baseWidth + 1.5 : baseWidth,
          strokeDasharray: dashArray,
          transition: 'stroke-width 0.2s ease',
          ...style,
        }}
      />

      {/* 流动粒子 — 只有跨 Agent 边和 hover 时显示 */}
      {(isCrossAgent || (hovered && !isInternal)) && (
        <>
          <circle r={hovered ? 4.5 : 3} fill={color} opacity={0.85}>
            <animateMotion dur={hovered ? '1.5s' : '2.5s'} repeatCount="indefinite" path={edgePath} />
          </circle>
          {isCrossAgent && strength > 2 && (
            <circle r={2} fill={color} opacity={0.5}>
              <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} begin="1.2s" />
            </circle>
          )}
        </>
      )}

      {/* 标签 — 只有跨 Agent 边和横切边显示 */}
      {(isCrossAgent || isCrosscut) && label && (
        <foreignObject
          x={labelX - 60}
          y={labelY - 12}
          width={120}
          height={24}
          className="pointer-events-none overflow-visible"
        >
          <div className="flex items-center justify-center">
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] leading-tight whitespace-nowrap font-medium"
              style={{
                backgroundColor: hovered ? `${color}35` : `${color}18`,
                color: color,
                border: `1px solid ${hovered ? `${color}60` : `${color}25`}`,
                backdropFilter: 'blur(8px)',
                transition: 'all 0.2s ease',
              }}
            >
              {isCrosscut && <span>🛡️</span>}
              <span>{label}</span>
            </span>
          </div>
        </foreignObject>
      )}

      {/* 悬停详情面板 — 非内部边 */}
      {hovered && !isInternal && edgeData && (
        <foreignObject
          x={labelX - 80}
          y={labelY + 14}
          width={160}
          height={70}
          className="pointer-events-none overflow-visible"
        >
          <div className="bg-ct-bg-secondary/95 backdrop-blur border border-ct-bg-tertiary rounded-xl px-3 py-2 shadow-2xl">
            <div className="text-[10px] space-y-1">
              <div className="flex justify-between text-ct-text-secondary">
                <span>类型</span>
                <span className="font-medium" style={{ color }}>
                  {isCrossAgent ? '跨层交付' : isCrosscut ? '横切挑战' : edgeType}
                </span>
              </div>
              {strength > 0 && (
                <div className="flex justify-between text-ct-text-secondary">
                  <span>强度</span>
                  <span className="text-ct-text-primary font-bold">{strength}</span>
                </div>
              )}
              {edgeData.last_transfer && (
                <div className="flex justify-between text-ct-text-secondary">
                  <span>最近传递</span>
                  <span className="text-ct-text-primary truncate max-w-[80px]">{edgeData.last_transfer}</span>
                </div>
              )}
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
};
