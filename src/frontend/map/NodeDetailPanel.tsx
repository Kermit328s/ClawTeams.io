import React from 'react';
import { useMapStore } from '@/store';
import type { MapNodeData } from '@/types';

interface NodeDetailPanelProps {
  nodeId: string;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ nodeId }) => {
  const { nodes, confirmNode, deleteNode, closeDetailPanel, adjustNode } =
    useMapStore();

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as MapNodeData;

  const layerLabels: Record<string, string> = {
    generation: '生成层',
    orchestration: '编排层',
    execution: '执行层',
    cognition: '认知层',
  };

  const nodeTypeLabels: Record<string, string> = {
    goal: '目标',
    task: '任务',
    decision: '决策',
    human: '人工',
    cognition: '认知',
    draft: '草稿',
  };

  const statusColors: Record<string, string> = {
    gray: 'bg-gray-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-claw-surface border-l border-claw-border z-20 flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-claw-border">
        <h3 className="text-sm font-medium text-claw-text">节点详情</h3>
        <button
          onClick={closeDetailPanel}
          className="p-1 rounded hover:bg-claw-border/50 text-claw-muted hover:text-claw-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          <label className="text-[10px] text-claw-muted uppercase tracking-wider">
            名称
          </label>
          <p className="text-sm text-claw-text mt-1 font-medium">
            {data.label}
          </p>
        </div>

        {/* Description */}
        {data.description && (
          <div>
            <label className="text-[10px] text-claw-muted uppercase tracking-wider">
              描述
            </label>
            <p className="text-xs text-claw-muted mt-1 leading-relaxed">
              {data.description}
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-claw-muted uppercase tracking-wider">
              类型
            </label>
            <p className="text-xs text-claw-text mt-1">
              {nodeTypeLabels[data.nodeType] || data.nodeType}
            </p>
          </div>
          <div>
            <label className="text-[10px] text-claw-muted uppercase tracking-wider">
              层级
            </label>
            <p className="text-xs text-claw-text mt-1">
              {layerLabels[data.layer] || data.layer}
            </p>
          </div>
          {data.taskStatus && (
            <div>
              <label className="text-[10px] text-claw-muted uppercase tracking-wider">
                状态
              </label>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${statusColors[data.taskStatus] || 'bg-gray-500'}`}
                />
                <span className="text-xs text-claw-text capitalize">
                  {data.taskStatus}
                </span>
              </div>
            </div>
          )}
          {data.isDraft && (
            <div>
              <label className="text-[10px] text-claw-muted uppercase tracking-wider">
                草稿
              </label>
              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-claw-orange/20 text-claw-orange">
                待确认
              </span>
            </div>
          )}
        </div>

        {/* Node ID */}
        <div>
          <label className="text-[10px] text-claw-muted uppercase tracking-wider">
            ID
          </label>
          <p className="text-[10px] text-claw-muted mt-1 font-mono break-all">
            {nodeId}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-claw-border flex gap-2">
        <button
          onClick={() => confirmNode(nodeId)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-claw-success/10 text-claw-success text-xs font-medium hover:bg-claw-success/20 transition-colors"
          title="确认"
        >
          <span>&#10003;</span> 确认
        </button>
        <button
          onClick={() => {
            const newLabel = window.prompt('调整名称:', data.label);
            if (newLabel && newLabel !== data.label) {
              adjustNode(nodeId, { label: newLabel });
            }
          }}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-claw-info/10 text-claw-info text-xs font-medium hover:bg-claw-info/20 transition-colors"
          title="调整"
        >
          <span>&#9998;</span> 调整
        </button>
        <button
          onClick={() => deleteNode(nodeId)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-claw-danger/10 text-claw-danger text-xs font-medium hover:bg-claw-danger/20 transition-colors"
          title="删除"
        >
          <span>&times;</span> 删除
        </button>
      </div>
    </div>
  );
};
