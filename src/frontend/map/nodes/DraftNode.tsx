import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { MapNodeData } from '@/types';
import { BaseNodeWrapper } from './BaseNodeWrapper';

export const DraftNodeComponent = memo(({ data, selected }: NodeProps) => {
  const d = data as MapNodeData;

  return (
    <BaseNodeWrapper
      isDraft={true}
      selected={selected}
      className="bg-claw-orange/5 min-w-[160px]"
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded bg-claw-orange/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-claw-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </span>
          <span className="text-[10px] text-claw-orange font-medium uppercase tracking-wider">
            草稿
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

DraftNodeComponent.displayName = 'DraftNodeComponent';
