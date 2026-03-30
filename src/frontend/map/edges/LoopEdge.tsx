import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

/** Loop-back edge (curved, animated, red) */
export const LoopEdge: React.FC<EdgeProps> = ({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, ...rest
}) => {
  const [edgePath] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    curvature: 0.8,
  });

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: '#ef4444',
        strokeWidth: 1.5,
        strokeDasharray: '8 4',
      }}
      {...rest}
    />
  );
};
