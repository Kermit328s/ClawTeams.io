import React from 'react';
import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';

/** Parallel execution edge (dashed, animated) */
export const ParallelEdge: React.FC<EdgeProps> = ({
  sourceX, sourceY, targetX, targetY, ...rest
}) => {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: '#3b82f6',
        strokeWidth: 1.5,
        strokeDasharray: '6 3',
      }}
      {...rest}
    />
  );
};
