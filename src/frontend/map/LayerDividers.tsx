import React from 'react';
import { Panel } from '@xyflow/react';

/**
 * Visual layer dividers showing the four-layer architecture.
 * Rendered as a legend panel in the top-right of the map.
 */
export const LayerDividers: React.FC = () => {
  const layers = [
    { name: '生成层', color: 'bg-claw-primary/30', desc: 'AI 在工作' },
    { name: '编排层', color: 'bg-claw-info/30', desc: '计划在形成' },
    { name: '执行层', color: 'bg-claw-success/30', desc: '龙虾在跑' },
    { name: '认知层', color: 'bg-claw-purple/30', desc: '知识沉淀' },
  ];

  return (
    <Panel position="top-right">
      <div className="bg-claw-surface/90 backdrop-blur-sm border border-claw-border rounded-lg p-2 space-y-1">
        <div className="text-[10px] text-claw-muted font-medium mb-1 px-1">
          层级
        </div>
        {layers.map((layer) => (
          <div key={layer.name} className="flex items-center gap-2 px-1">
            <span className={`w-2 h-2 rounded-sm ${layer.color}`} />
            <span className="text-[10px] text-claw-text">{layer.name}</span>
            <span className="text-[10px] text-claw-muted">{layer.desc}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
};
