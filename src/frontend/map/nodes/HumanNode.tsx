import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { MapNodeData } from '@/types';
import { BaseNodeWrapper } from './BaseNodeWrapper';

export const HumanNodeComponent = memo(({ data, selected }: NodeProps) => {
  const d = data as MapNodeData;

  return (
    <BaseNodeWrapper
      isDraft={d.isDraft}
      selected={selected}
      className="bg-yellow-500/15 border-yellow-500/50 min-w-[160px] animate-pulse-glow"
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded bg-yellow-500/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </span>
          <span className="text-[10px] text-yellow-500 font-medium uppercase tracking-wider">
            需要人工
          </span>
        </div>
        <p className="text-sm font-medium text-claw-text leading-tight">
          {d.label}
        </p>
        {d.description && (
          <p className="text-[10px] text-claw-muted mt-1 line-clamp-2">
            {d.description}
          </p>
        )}
      </div>
    </BaseNodeWrapper>
  );
});

HumanNodeComponent.displayName = 'HumanNodeComponent';
