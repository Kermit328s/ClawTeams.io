import React from 'react';
import type { Conversation } from '@/types';

interface ConversationHeaderProps {
  conversation: Conversation | null;
}

const typeLabels: Record<string, string> = {
  'human-brain': '与大脑对话',
  'two-person': '两人对话',
  'group': '多人群组',
};

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
}) => {
  if (!conversation) {
    return (
      <div className="h-14 flex items-center px-4 border-b border-claw-border">
        <span className="text-claw-muted">选择一个对话</span>
      </div>
    );
  }

  return (
    <div className="h-14 flex items-center justify-between px-4 border-b border-claw-border shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-claw-primary/20 flex items-center justify-center text-sm text-claw-primary font-medium">
          {conversation.title.charAt(0)}
        </div>
        <div>
          <h3 className="text-sm font-medium text-claw-text">
            {conversation.title}
          </h3>
          <span className="text-xs text-claw-muted">
            {typeLabels[conversation.type] || conversation.type}
            {' · '}
            {conversation.participants.length} 位参与者
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="p-1.5 rounded hover:bg-claw-border/50 text-claw-muted hover:text-claw-text transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button className="p-1.5 rounded hover:bg-claw-border/50 text-claw-muted hover:text-claw-text transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
