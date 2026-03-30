import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { MapNodeData } from '@/types';
import { BaseNodeWrapper } from './BaseNodeWrapper';

export const DecisionNodeComponent = memo(({ data, selected }: NodeProps) => {
  const d = data as MapNodeData;

  return (
    <BaseNodeWrapper
      isDraft={d.isDraft}
      selected={selected}
      className="bg-claw-warning/10 min-w-[160px]"
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded bg-claw-warning/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-claw-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </span>
          <span className="text-[10px] text-claw-warning font-medium uppercase tracking-wider">
            决策
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

DecisionNodeComponent.displayName = 'DecisionNodeComponent';
