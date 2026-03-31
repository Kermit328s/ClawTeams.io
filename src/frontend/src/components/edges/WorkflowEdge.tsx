// ============================================================
// WorkflowEdge -- React Flow 自定义边
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { WorkflowEdgeData, EdgeType } from '../../types';

const EDGE_COLORS: Record<EdgeType, string> = {
  collaboration: '#6366f1',
  subagent: '#f59e0b',
  data_flow: '#10b981',
  sequence: '#94a3b8',
};

const EDGE_WIDTHS: Record<EdgeType, number> = {
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

  const edgeType = (rest as Record<string, unknown>).type as EdgeType | undefined;
  const color = EDGE_COLORS[edgeType || 'sequence'];
  const width = EDGE_WIDTHS[edgeType || 'sequence'];

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const onEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setHovered(true), 200);
  }, []);

  const onLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHovered(false);
  }, []);

  return (
    <>
      {/* Invisible wider path for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{ cursor: 'pointer' }}
      />

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: hovered ? width + 1.5 : width,
          transition: 'stroke-width 0.2s ease',
          ...style,
        }}
      />

      {/* Hover label */}
      {hovered && edgeData?.label && (
        <foreignObject
          x={labelX - 60}
          y={labelY - 30}
          width={120}
          height={60}
          className="pointer-events-none"
        >
          <div className="bg-ct-bg-tertiary border border-ct-bg-tertiary/80 rounded px-2 py-1 text-center shadow-lg">
            <div className="text-[10px] text-ct-text-primary">{edgeData.label}</div>
            {edgeData.strength > 0 && (
              <div className="text-[9px] text-ct-text-secondary">
                {'\u534F\u4F5C'} {edgeData.strength} {'\u6B21'}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </>
  );
};
