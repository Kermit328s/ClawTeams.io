import React from 'react';
import { useMapStore } from '@/store';

export const MapToolbar: React.FC = () => {
  const { nodes, edges } = useMapStore();

  const nodeCount = nodes.length;
  const draftCount = nodes.filter((n) => (n.data as any)?.isDraft).length;

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
      <div className="bg-claw-surface/90 backdrop-blur-sm border border-claw-border rounded-lg px-3 py-1.5 flex items-center gap-3 text-xs text-claw-muted">
        <span>
          节点: <span className="text-claw-text font-medium">{nodeCount}</span>
        </span>
        <span className="w-px h-3 bg-claw-border" />
        <span>
          连接: <span className="text-claw-text font-medium">{edges.length}</span>
        </span>
        {draftCount > 0 && (
          <>
            <span className="w-px h-3 bg-claw-border" />
            <span className="text-claw-orange">
              草稿: <span className="font-medium">{draftCount}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
};
