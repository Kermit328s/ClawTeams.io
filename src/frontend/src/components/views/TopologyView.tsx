// ============================================================
// TopologyView -- 技能级拓扑图视图
// 默认隐藏连线，点击卡片后只显示相关连线
// ============================================================

import React, { useEffect, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore, useClawStore } from '../../store';
import { api } from '../../api/client';
import { SkillCard } from '../nodes/SkillCard';
import { AgentGroupNode } from '../nodes/AgentGroupNode';
import { CustomWorkflowEdge } from '../edges/WorkflowEdge';
import type {
  WorkflowGraph,
  WorkflowNode as WfNode,
  WorkflowEdge as WfEdge,
} from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = {
  skill: SkillCard,
  'agent-group': AgentGroupNode,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: any = {
  internal: CustomWorkflowEdge,
  cross_agent: CustomWorkflowEdge,
  crosscut: CustomWorkflowEdge,
  collaboration: CustomWorkflowEdge,
  subagent: CustomWorkflowEdge,
  data_flow: CustomWorkflowEdge,
  sequence: CustomWorkflowEdge,
};

export const TopologyView: React.FC = () => {
  const graphNodes = useGraphStore((s) => s.nodes);
  const graphEdges = useGraphStore((s) => s.edges);
  const setGraph = useGraphStore((s) => s.setGraph);
  const workspaceId = useClawStore((s) => s.workspaceId);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // 当前选中的节点 ID（用于过滤边）
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Fetch graph data
  useEffect(() => {
    if (!workspaceId) return;
    api.getWorkflowGraph(workspaceId).then((data) => {
      const graph = data as WorkflowGraph;
      if (graph?.nodes && graph?.edges) {
        setGraph(graph.nodes as WfNode[], graph.edges as WfEdge[], graph.metadata.generated_at);
      }
    }).catch(() => {});
  }, [workspaceId, setGraph]);

  // Sync store nodes to React Flow
  useEffect(() => {
    const rfNodes = graphNodes.map((n: WfNode) => {
      if (n.type === 'agent-group') {
        return {
          id: n.id,
          type: 'agent-group' as const,
          position: n.position,
          data: n.data as Record<string, unknown>,
          style: (n as { style?: Record<string, unknown> }).style,
          zIndex: -1,
          selectable: false,
          draggable: false,
        };
      }
      return {
        id: n.id,
        type: 'skill' as const,
        position: n.position,
        data: n.data as Record<string, unknown>,
      };
    });
    setNodes(rfNodes);
  }, [graphNodes, setNodes]);

  // Sync edges — 根据选中节点过滤
  useEffect(() => {
    const rfEdges = graphEdges.map((e: WfEdge) => {
      const isRelated = selectedNodeId
        ? e.source === selectedNodeId || e.target === selectedNodeId
        : false;

      // 没选中任何节点时：内部边淡显，跨 Agent 边隐藏
      // 选中节点时：只显示相关边，其余完全隐藏
      let opacity: number;
      let hidden: boolean;

      if (selectedNodeId === null) {
        // 默认状态：内部边微弱显示（暗示结构），跨 Agent 边隐藏
        if (e.type === 'internal') {
          opacity = 0.3;
          hidden = false;
        } else {
          opacity = 0;
          hidden = true;
        }
      } else {
        // 有选中节点：只显示相关边
        if (isRelated) {
          opacity = 1;
          hidden = false;
        } else {
          opacity = 0;
          hidden = true;
        }
      }

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        data: e.data as Record<string, unknown>,
        animated: isRelated && (e.type === 'cross_agent'),
        style: {
          ...(e.style as Record<string, unknown>),
          opacity,
          transition: 'opacity 0.3s ease',
        },
        hidden,
      };
    });
    setEdges(rfEdges);
  }, [graphEdges, selectedNodeId, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const nodeData = node.data as Record<string, unknown>;

    // 点击 skill 节点：切换选中状态
    if (node.type === 'skill') {
      setSelectedNodeId(prev => prev === node.id ? null : node.id);
    }

    // 同时打开详情面板
    if (nodeData.agent_id) {
      useClawStore.getState().setDetailTarget({
        type: 'agent',
        id: nodeData.agent_id as string,
      });
    }
  }, []);

  // 点击空白处取消选中
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const miniMapNodeColor = useCallback((node: Node) => {
    const nodeData = node.data as Record<string, unknown>;
    if (node.type === 'agent-group') {
      return (nodeData.agent_color as string) || '#334155';
    }
    const status = nodeData.status as string | undefined;
    if (status === 'running') return '#3B82F6';
    if (status === 'completed') return '#10B981';
    return (nodeData.agent_color as string) || '#334155';
  }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls
          position="bottom-left"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={miniMapNodeColor}
          maskColor="rgba(15, 23, 42, 0.7)"
          position="bottom-right"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* 提示文字 */}
      {selectedNodeId === null && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-ct-text-secondary/50 pointer-events-none">
          点击卡片查看连线关系
        </div>
      )}
    </div>
  );
};
