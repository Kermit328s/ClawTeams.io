// ============================================================
// AgentGroupNode -- Agent 行分组背景节点
// ============================================================
// 每个 Agent 的技能卡片行有一个半透明背景 + 左侧色条 + Agent 标签

import React from 'react';
import { type NodeProps } from '@xyflow/react';
import type { AgentGroupData } from '../../types';

export const AgentGroupNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as AgentGroupData;

  return (
    <div
      className="relative rounded-2xl"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: `${d.agent_color}06`,
        border: `1px solid ${d.agent_color}18`,
        borderRadius: 16,
        pointerEvents: 'none',
      }}
    >
      {/* 左侧 Agent 标签 */}
      <div
        className="absolute flex flex-col items-center justify-center gap-1"
        style={{
          left: 8,
          top: 0,
          bottom: 0,
          width: 44,
        }}
      >
        <span className="text-2xl">{d.agent_emoji || '🤖'}</span>
        <span
          className="text-[10px] font-bold writing-vertical"
          style={{
            color: d.agent_color,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            letterSpacing: '0.05em',
            maxHeight: 120,
            overflow: 'hidden',
          }}
        >
          {d.agent_name}
        </span>
      </div>

      {/* 左侧色条 */}
      <div
        className="absolute left-0 top-4 bottom-4 rounded-l-2xl"
        style={{
          width: 3,
          backgroundColor: d.agent_color,
          opacity: 0.6,
        }}
      />

      {/* 横切角色标记 */}
      {d.is_crosscut && (
        <div
          className="absolute top-2 right-3 text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${d.agent_color}20`,
            color: d.agent_color,
            border: `1px solid ${d.agent_color}40`,
          }}
        >
          横切
        </div>
      )}
    </div>
  );
};
