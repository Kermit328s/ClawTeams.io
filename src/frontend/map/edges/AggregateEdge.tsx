import React from 'react';
import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';

/** Aggregate edge (thick, converging) */
export const AggregateEdge: React.FC<EdgeProps> = ({
  sourceX, sourceY, targetX, targetY, ...rest
}) => {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: '#22c55e',
        strokeWidth: 2.5,
      }}
      markerEnd="url(#arrow-green)"
      {...rest}
    />
  );
};
