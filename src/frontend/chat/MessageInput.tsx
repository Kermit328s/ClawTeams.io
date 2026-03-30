import React, { useState, useRef, useCallback } from 'react';
import clsx from 'clsx';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入你的想法...',
}) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  return (
    <div className="px-3 pb-3 pt-2 border-t border-claw-border shrink-0">
      <div className="flex items-end gap-2 bg-claw-bg rounded-lg border border-claw-border px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={clsx(
            'flex-1 bg-transparent text-sm text-claw-text placeholder-claw-muted',
            'resize-none outline-none leading-relaxed max-h-[120px]',
            disabled && 'opacity-50',
          )}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className={clsx(
            'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            value.trim() && !disabled
              ? 'bg-claw-primary text-white hover:bg-claw-primary/80'
              : 'bg-claw-border/50 text-claw-muted',
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
      <div className="text-[10px] text-claw-muted mt-1 px-1">
        Enter 发送 · Shift+Enter 换行
      </div>
    </div>
  );
};
