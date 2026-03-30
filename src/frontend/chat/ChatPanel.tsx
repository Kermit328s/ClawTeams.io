import React, { useRef, useEffect } from 'react';
import { useChatStore } from '@/store';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ConversationHeader } from './ConversationHeader';

export const ChatPanel: React.FC = () => {
  const {
    activeConversationId,
    messagesByConversation,
    conversations,
    isSending,
    sendMessage,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  );

  const messages = activeConversationId
    ? messagesByConversation[activeConversationId] || []
    : [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = (content: string) => {
    if (!activeConversationId) return;
    sendMessage(activeConversationId, content);
  };

  return (
    <div className="flex flex-col h-full bg-claw-surface border-r border-claw-border">
      {/* Header */}
      <ConversationHeader conversation={activeConversation ?? null} />

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            conversationId={activeConversationId!}
          />
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-claw-muted text-sm pl-2">
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 bg-claw-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-claw-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-claw-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>大脑思考中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={handleSend} disabled={isSending} />
    </div>
  );
};
