// ============================================================
// TopologyView -- 拓扑图视图 (@xyflow/react)
// ============================================================

import React, { useEffect, useCallback } from 'react';
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
import { AgentNode } from '../nodes/AgentNode';
import { CustomWorkflowEdge } from '../edges/WorkflowEdge';
import type { WorkflowGraph, WorkflowNode as WfNode, WorkflowEdge as WfEdge } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = { agent: AgentNode };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: any = {
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

  // Fetch graph data
  useEffect(() => {
    if (!workspaceId) return;

    api.getWorkflowGraph(workspaceId).then((data) => {
      const graph = data as WorkflowGraph;
      if (graph?.nodes && graph?.edges) {
        setGraph(graph.nodes, graph.edges as WfEdge[], graph.metadata.generated_at);
      }
    }).catch(() => {});
  }, [workspaceId, setGraph]);

  // Sync store nodes to React Flow
  useEffect(() => {
    const rfNodes = graphNodes.map((n: WfNode) => ({
      id: n.id,
      type: 'agent' as const,
      position: n.position,
      data: n.data as Record<string, unknown>,
    }));
    setNodes(rfNodes);
  }, [graphNodes, setNodes]);

  useEffect(() => {
    const rfEdges = graphEdges.map((e: WfEdge) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      data: e.data as Record<string, unknown>,
      animated: e.animated ?? (e.type === 'subagent'),
    }));
    setEdges(rfEdges);
  }, [graphEdges, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const nodeData = node.data as Record<string, unknown>;
    useClawStore.getState().setDetailTarget({
      type: 'agent',
      id: nodeData.agent_id as string,
    });
  }, []);

  const miniMapNodeColor = useCallback((node: Node) => {
    const nodeData = node.data as Record<string, unknown>;
    const status = nodeData.status as string | undefined;
    if (status === 'running') return '#3B82F6';
    if (status === 'failed') return '#EF4444';
    return '#334155';
  }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
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
    </div>
  );
};
