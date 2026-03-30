import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps, EdgeLabelRenderer } from '@xyflow/react';

/** Conditional edge (dotted with diamond marker) */
export const ConditionEdge: React.FC<EdgeProps> = ({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, ...rest
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: '#f59e0b',
          strokeWidth: 1.5,
          strokeDasharray: '3 3',
        }}
        {...rest}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute bg-claw-surface text-[9px] text-claw-warning px-1.5 py-0.5 rounded border border-claw-warning/30 pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
