import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useMapStore } from '@/store';
import { GoalNodeComponent } from './nodes/GoalNode';
import { TaskNodeComponent } from './nodes/TaskNode';
import { DecisionNodeComponent } from './nodes/DecisionNode';
import { HumanNodeComponent } from './nodes/HumanNode';
import { CognitionNodeComponent } from './nodes/CognitionNode';
import { DraftNodeComponent } from './nodes/DraftNode';
import { SequenceEdge } from './edges/SequenceEdge';
import { ParallelEdge } from './edges/ParallelEdge';
import { ConditionEdge } from './edges/ConditionEdge';
import { AggregateEdge } from './edges/AggregateEdge';
import { LoopEdge } from './edges/LoopEdge';
import { NodeDetailPanel } from './NodeDetailPanel';
import { LayerDividers } from './LayerDividers';
import { MapToolbar } from './MapToolbar';

export const MapPanel: React.FC = () => {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    selectNode,
    selectedNodeId,
    detailPanelOpen,
    isGenerating,
  } = useMapStore();

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      goalNode: GoalNodeComponent,
      taskNode: TaskNodeComponent,
      decisionNode: DecisionNodeComponent,
      humanNode: HumanNodeComponent,
      cognitionNode: CognitionNodeComponent,
      draftNode: DraftNodeComponent,
    }),
    [],
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      sequence: SequenceEdge,
      parallel: ParallelEdge,
      condition: ConditionEdge,
      aggregate: AggregateEdge,
      loop: LoopEdge,
    }),
    [],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes(applyNodeChanges(changes, nodes) as any);
    },
    [nodes, setNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges(applyEdgeChanges(changes, edges));
    },
    [edges, setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges(addEdge({ ...connection, type: 'sequence' }, edges));
    },
    [edges, setEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="relative h-full w-full bg-claw-bg">
      {/* Generating overlay */}
      {isGenerating && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-claw-bg/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-claw-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-claw-muted">AI 正在生成地图...</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <MapToolbar />

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{ type: 'sequence' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2d3a" />
        <Controls
          position="bottom-left"
          className="!bg-claw-surface !border-claw-border !shadow-lg"
        />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            const data = node.data as any;
            switch (data?.nodeType) {
              case 'goal': return '#6366f1';
              case 'task': {
                const colors: Record<string, string> = {
                  gray: '#71717a', blue: '#3b82f6', green: '#22c55e',
                  red: '#ef4444', yellow: '#f59e0b',
                };
                return colors[data.taskStatus || 'gray'] || '#71717a';
              }
              case 'decision': return '#f59e0b';
              case 'human': return '#f59e0b';
              case 'cognition': return '#a855f7';
              case 'draft': return '#f97316';
              default: return '#71717a';
            }
          }}
          className="!bg-claw-surface !border-claw-border"
          maskColor="rgba(15, 17, 23, 0.7)"
        />
        <LayerDividers />
      </ReactFlow>

      {/* Node detail panel */}
      {detailPanelOpen && selectedNodeId && (
        <NodeDetailPanel nodeId={selectedNodeId} />
      )}
    </div>
  );
};
