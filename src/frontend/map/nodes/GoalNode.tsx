import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { MapNodeData } from '@/types';
import { BaseNodeWrapper } from './BaseNodeWrapper';

export const GoalNodeComponent = memo(({ data, selected }: NodeProps) => {
  const d = data as MapNodeData;

  return (
    <BaseNodeWrapper
      isDraft={d.isDraft}
      selected={selected}
      className="bg-claw-primary/10 min-w-[180px]"
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded bg-claw-primary/30 flex items-center justify-center text-[10px]">
            <svg className="w-3 h-3 text-claw-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
            </svg>
          </span>
          <span className="text-[10px] text-claw-primary font-medium uppercase tracking-wider">
            目标
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

GoalNodeComponent.displayName = 'GoalNodeComponent';
