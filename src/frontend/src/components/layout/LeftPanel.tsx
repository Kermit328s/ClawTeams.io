// ============================================================
// LeftPanel -- 龙虾 + Agent 列表（极简默认）
// ============================================================

import React, { useState, useRef, useCallback } from 'react';
import { useClawStore } from '../../store';
import { StatusDot } from '../shared/StatusDot';
import type { Agent } from '../../types';

const AgentRow: React.FC<{ agent: Agent; isLast: boolean }> = ({ agent, isLast }) => {
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setHoveredAgentId = useClawStore((s) => s.setHoveredAgentId);
  const setDetailTarget = useClawStore((s) => s.setDetailTarget);

  const onEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setHovered(true);
      setHoveredAgentId(agent.agent_id);
    }, 200);
  }, [agent.agent_id, setHoveredAgentId]);

  const onLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHovered(false);
    setHoveredAgentId(null);
  }, [setHoveredAgentId]);

  const onClick = useCallback(() => {
    setDetailTarget({ type: 'agent', id: agent.agent_id });
  }, [agent.agent_id, setDetailTarget]);

  const prefix = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
  const continuation = isLast ? '\u00A0\u00A0\u00A0' : '\u2502\u00A0\u00A0';

  return (
    <div
      className="cursor-pointer hover:bg-ct-bg-tertiary/30 transition-colors rounded"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {/* Layer 0: emoji + short name + status dot */}
      <div className="flex items-center gap-1 px-1 py-0.5">
        <span className="text-ct-text-secondary text-[10px] font-mono select-none">{prefix}</span>
        <span className="text-sm">{agent.emoji}</span>
        <span className="text-xs text-ct-text-primary truncate flex-1">{agent.name}</span>
        <StatusDot
          status={agent.status}
          size="sm"
          pulse={agent.status === 'failed'}
        />
        {agent.has_file_change && (
          <span className="w-1.5 h-1.5 rounded-full bg-ct-changed animate-pulse-3" />
        )}
      </div>

      {/* Layer 1: hover details */}
      {hovered && (
        <div className="px-1 pb-1">
          <div className="flex items-center gap-1 ml-4">
            <span className="text-ct-text-secondary text-[10px] font-mono select-none">
              {continuation}
            </span>
            <span className="text-[10px] text-ct-text-secondary truncate">
              {agent.role || agent.creature || ''} {agent.model ? `\u00B7 ${agent.model}` : ''}
            </span>
          </div>
          {agent.current_task && (
            <div className="flex items-center gap-1 ml-4">
              <span className="text-ct-text-secondary text-[10px] font-mono select-none">
                {continuation}
              </span>
              <span className="text-[10px] text-ct-running truncate">
                \u6B63\u5728\u6267\u884C "{agent.current_task}"
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const LeftPanel: React.FC = () => {
  const claws = useClawStore((s) => s.claws);

  return (
    <div className="w-[200px] bg-ct-bg-secondary border-r border-ct-bg-tertiary flex flex-col overflow-y-auto shrink-0">
      <div className="p-2 space-y-2">
        {claws.map((claw) => (
          <div key={claw.claw_id}>
            {/* Claw header */}
            <div className="flex items-center gap-1.5 px-1 py-1">
              <span className="text-sm">{'\uD83E\uDD9E'}</span>
              <span className="text-xs font-medium text-ct-text-primary truncate flex-1">
                {claw.name}
              </span>
              <StatusDot status={claw.status} size="sm" useEmoji />
            </div>

            {/* Agent list */}
            <div className="ml-1">
              {(claw.agents ?? []).map((agent, i) => (
                <AgentRow
                  key={agent.agent_id}
                  agent={agent}
                  isLast={i === (claw.agents ?? []).length - 1}
                />
              ))}
            </div>
          </div>
        ))}

        {claws.length === 0 && (
          <div className="text-xs text-ct-text-secondary text-center py-8">
            \u7B49\u5F85\u9F99\u867E\u63A5\u5165...
          </div>
        )}
      </div>
    </div>
  );
};
