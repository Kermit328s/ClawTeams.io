import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { MapNodeData, CognitionVisualState } from '@/types';
import { BaseNodeWrapper } from './BaseNodeWrapper';
import clsx from 'clsx';

const stateStyles: Record<CognitionVisualState, { border: string; bg: string; label: string }> = {
  hypothesis: {
    border: 'border-dashed border-claw-orange',
    bg: 'bg-claw-orange/5',
    label: '假设求证中',
  },
  disproved: {
    border: 'border-solid border-claw-danger',
    bg: 'bg-claw-danger/5',
    label: '已推翻',
  },
  verified: {
    border: 'border-solid border-claw-success',
    bg: 'bg-claw-success/5',
    label: '已验证',
  },
  iterating: {
    border: 'border-dashed border-claw-purple',
    bg: 'bg-claw-purple/5',
    label: '认知迭代中',
  },
};

export const CognitionNodeComponent = memo(({ data, selected }: NodeProps) => {
  const d = data as MapNodeData;
  const state = d.cognitionState || 'hypothesis';
  const style = stateStyles[state];

  return (
    <BaseNodeWrapper
      isDraft={d.isDraft}
      selected={selected}
      className={clsx('min-w-[160px] border-2', style.border, style.bg)}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-claw-purple/30 flex items-center justify-center">
              <svg className="w-3 h-3 text-claw-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
            </span>
            <span className="text-[10px] text-claw-purple font-medium uppercase tracking-wider">
              认知
            </span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-claw-surface text-claw-muted">
            {style.label}
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

CognitionNodeComponent.displayName = 'CognitionNodeComponent';
