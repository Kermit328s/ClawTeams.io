import React from 'react';
import clsx from 'clsx';
import type { ChatMessage, BubbleAction } from '@/types';
import { useChatStore } from '@/store';
import { ExecutionCard } from './ExecutionCard';

interface MessageBubbleProps {
  message: ChatMessage;
  conversationId: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  conversationId,
}) => {
  const { convertToExecution, convertToCognition, initiateDecision } =
    useChatStore();

  const isHuman = message.senderType === 'human';

  // If this message has been converted to execution, show the status card
  if (message.executionState) {
    return (
      <div className={clsx('flex', isHuman ? 'justify-end' : 'justify-start')}>
        <ExecutionCard
          state={message.executionState}
          messageId={message.id}
          conversationId={conversationId}
        />
      </div>
    );
  }

  const handleAction = (action: BubbleAction) => {
    switch (action) {
      case 'execute':
        convertToExecution(message.id, conversationId);
        break;
      case 'cognition':
        convertToCognition(message.id, conversationId);
        break;
      case 'decision':
        initiateDecision(message.id, conversationId);
        break;
    }
  };

  const actionLabels: Record<BubbleAction, string> = {
    execute: '转为执行 \u2192',
    cognition: '记入认知层 \u2192',
    decision: '发起决策 \u2192',
  };

  const actionColors: Record<BubbleAction, string> = {
    execute: 'bg-claw-primary/20 text-claw-primary hover:bg-claw-primary/30',
    cognition: 'bg-claw-purple/20 text-claw-purple hover:bg-claw-purple/30',
    decision: 'bg-claw-warning/20 text-claw-warning hover:bg-claw-warning/30',
  };

  const semanticBorderColors: Record<string, string> = {
    intent: 'border-l-claw-primary',
    cognition: 'border-l-claw-purple',
    both: 'border-l-claw-orange',
    conflict: 'border-l-claw-danger',
    normal: 'border-l-transparent',
  };

  return (
    <div
      className={clsx(
        'flex animate-fade-in-up',
        isHuman ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={clsx(
          'max-w-[80%] rounded-lg px-3 py-2 border-l-2',
          isHuman
            ? 'bg-claw-primary/10 text-claw-text'
            : 'bg-claw-bg text-claw-text',
          semanticBorderColors[message.semanticType] || 'border-l-transparent',
        )}
      >
        {/* Sender name for non-human messages */}
        {!isHuman && (
          <div className="text-xs text-claw-muted mb-1 font-medium">
            {message.senderName}
          </div>
        )}

        {/* Message content */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>

        {/* Action buttons */}
        {message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-claw-border/50">
            {message.actions.map((action) => (
              <button
                key={action}
                onClick={() => handleAction(action)}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  actionColors[action],
                )}
              >
                {actionLabels[action]}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className="text-[10px] text-claw-muted mt-1 text-right">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
};
