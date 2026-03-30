import React from 'react';
import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';

/** Standard sequential dependency edge (solid arrow) */
export const SequenceEdge: React.FC<EdgeProps> = ({
  sourceX, sourceY, targetX, targetY, ...rest
}) => {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <BaseEdge
      path={edgePath}
      style={{ stroke: '#6366f1', strokeWidth: 1.5 }}
      markerEnd="url(#arrow-indigo)"
      {...rest}
    />
  );
};
