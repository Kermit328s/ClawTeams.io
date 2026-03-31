// ============================================================
// BottomLog -- 活动日志
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useActivityStore } from '../../store';
import { StatusDot } from '../shared/StatusDot';

export const BottomLog: React.FC = () => {
  const entries = useActivityStore((s) => s.entries);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest) when new entry arrives
  useEffect(() => {
    if (scrollRef.current && entries.length > 0 && entries[0]?.is_new) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries]);

  const height = expanded ? 'h-[200px]' : 'h-[80px]';

  return (
    <div
      className={`${height} bg-ct-bg-secondary border-t border-ct-bg-tertiary flex flex-col shrink-0 transition-all duration-200`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 shrink-0">
        <span className="text-[10px] text-ct-text-secondary uppercase tracking-wider">
          \u6D3B\u52A8\u65E5\u5FD7
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-ct-text-secondary hover:text-ct-text-primary transition-colors"
        >
          {expanded ? '\u25BC \u6536\u8D77' : '\u25B2 \u5C55\u5F00'}
        </button>
      </div>

      {/* Entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`flex items-center gap-2 py-0.5 text-[11px] ${
              entry.is_new ? 'animate-slide-in animate-fade-highlight' : ''
            }`}
          >
            <span className="text-ct-text-secondary shrink-0 w-10 text-right font-mono">
              {formatTime(entry.timestamp)}
            </span>
            <span className="shrink-0">{entry.emoji}</span>
            <StatusDot status={entry.status} size="sm" />
            <span className="text-ct-text-primary truncate">{entry.message}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-[10px] text-ct-text-secondary text-center py-2">
            \u6682\u65E0\u6D3B\u52A8
          </div>
        )}
      </div>
    </div>
  );
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}
