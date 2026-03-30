import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { MapNodeData, TaskColorStatus } from '@/types';
import { BaseNodeWrapper } from './BaseNodeWrapper';
import clsx from 'clsx';

const statusStyles: Record<TaskColorStatus, { bg: string; dot: string; label: string }> = {
  gray: { bg: 'bg-gray-500/10', dot: 'bg-gray-500', label: '等待' },
  blue: { bg: 'bg-blue-500/10', dot: 'bg-blue-500', label: '执行中' },
  green: { bg: 'bg-green-500/10', dot: 'bg-green-500', label: '完成' },
  red: { bg: 'bg-red-500/10', dot: 'bg-red-500', label: '失败' },
  yellow: { bg: 'bg-yellow-500/10', dot: 'bg-yellow-500', label: '等待人工' },
};

export const TaskNodeComponent = memo(({ data, selected }: NodeProps) => {
  const d = data as MapNodeData;
  const status = d.taskStatus || 'gray';
  const style = statusStyles[status];

  return (
    <BaseNodeWrapper
      isDraft={d.isDraft}
      selected={selected}
      className={clsx('min-w-[160px]', style.bg)}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className={clsx('w-2 h-2 rounded-full', style.dot)} />
            <span className="text-[10px] text-claw-muted uppercase tracking-wider">
              任务
            </span>
          </div>
          <span className="text-[10px] text-claw-muted">{style.label}</span>
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
      {/* Execution progress bar for running tasks */}
      {status === 'blue' && (
        <div className="h-0.5 bg-claw-border rounded-b-lg overflow-hidden">
          <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      )}
    </BaseNodeWrapper>
  );
});

TaskNodeComponent.displayName = 'TaskNodeComponent';
