import React from 'react';
import clsx from 'clsx';
import type { ExecutionCardState } from '@/types';
import { useChatStore } from '@/store';

interface ExecutionCardProps {
  state: ExecutionCardState;
  messageId: string;
  conversationId: string;
}

export const ExecutionCard: React.FC<ExecutionCardProps> = ({
  state,
  messageId,
  conversationId,
}) => {
  const { updateExecutionState } = useChatStore();

  const statusConfig = {
    executing: {
      icon: (
        <span className="inline-block w-3 h-3 rounded-full bg-claw-info animate-pulse" />
      ),
      label: '执行中',
      borderColor: 'border-claw-info',
      bgColor: 'bg-claw-info/5',
    },
    pending_confirm: {
      icon: (
        <span className="inline-block w-3 h-3 rounded-full bg-claw-warning" />
      ),
      label: '待确认',
      borderColor: 'border-claw-warning',
      bgColor: 'bg-claw-warning/5',
    },
    completed: {
      icon: (
        <svg className="w-4 h-4 text-claw-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ),
      label: '已完成',
      borderColor: 'border-claw-success',
      bgColor: 'bg-claw-success/5',
    },
    failed: {
      icon: (
        <svg className="w-4 h-4 text-claw-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      label: '失败',
      borderColor: 'border-claw-danger',
      bgColor: 'bg-claw-danger/5',
    },
  };

  const config = statusConfig[state.status];

  const handleConfirmAction = (action: string) => {
    if (action === 'confirm') {
      updateExecutionState(messageId, conversationId, {
        ...state,
        status: 'completed',
        description: '任务已确认并执行完成',
      });
    }
  };

  return (
    <div
      className={clsx(
        'w-72 rounded-lg border p-3 animate-fade-in-up transition-all',
        config.borderColor,
        config.bgColor,
      )}
    >
      {/* Title row */}
      <div className="flex items-center gap-2 mb-2">
        {config.icon}
        <span className="text-sm font-medium text-claw-text flex-1 truncate">
          {state.title}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-claw-border/50 text-claw-muted">
          {config.label}
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-claw-border/50 mb-2" />

      {/* Description */}
      <p className="text-xs text-claw-muted leading-relaxed">
        {state.description}
      </p>

      {/* Details */}
      {state.details && (
        <p className="text-xs text-claw-text mt-2">{state.details}</p>
      )}

      {/* Confirm actions */}
      {state.status === 'pending_confirm' && state.confirmActions && (
        <div className="flex gap-2 mt-3">
          {state.confirmActions.map((ca) => (
            <button
              key={ca.action}
              onClick={() => handleConfirmAction(ca.action)}
              className={clsx(
                'flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                ca.action === 'confirm'
                  ? 'bg-claw-primary text-white hover:bg-claw-primary/80'
                  : 'bg-claw-border/50 text-claw-text hover:bg-claw-border',
              )}
            >
              {ca.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
