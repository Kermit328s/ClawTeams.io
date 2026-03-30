import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '../../src/frontend/store/mapStore';
import type { MapNodeData } from '../../src/frontend/types';

describe('mapStore', () => {
  beforeEach(() => {
    useMapStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      detailPanelOpen: false,
      isGenerating: false,
    });
  });

  it('should start with empty graph', () => {
    const state = useMapStore.getState();
    expect(state.nodes).toHaveLength(0);
    expect(state.edges).toHaveLength(0);
  });

  it('should add a node', () => {
    useMapStore.getState().addNode({
      id: 'test-node',
      type: 'goalNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Test Goal',
        nodeType: 'goal',
        layer: 'orchestration',
        isDraft: true,
      } as MapNodeData,
    });

    expect(useMapStore.getState().nodes).toHaveLength(1);
    expect(useMapStore.getState().nodes[0].id).toBe('test-node');
  });

  it('should add an edge', () => {
    useMapStore.getState().addEdge({
      id: 'test-edge',
      source: 'a',
      target: 'b',
      type: 'sequence',
    });

    expect(useMapStore.getState().edges).toHaveLength(1);
  });

  it('should select a node and open detail panel', () => {
    useMapStore.getState().selectNode('test-node');
    const state = useMapStore.getState();
    expect(state.selectedNodeId).toBe('test-node');
    expect(state.detailPanelOpen).toBe(true);
  });

  it('should deselect node when selecting null', () => {
    useMapStore.getState().selectNode('test-node');
    useMapStore.getState().selectNode(null);
    const state = useMapStore.getState();
    expect(state.selectedNodeId).toBeNull();
    expect(state.detailPanelOpen).toBe(false);
  });

  it('should confirm a draft node', () => {
    useMapStore.getState().addNode({
      id: 'draft-1',
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Draft Task',
        nodeType: 'task',
        layer: 'execution',
        isDraft: true,
        taskStatus: 'gray',
      } as MapNodeData,
    });

    useMapStore.getState().confirmNode('draft-1');
    const node = useMapStore.getState().nodes.find((n) => n.id === 'draft-1');
    expect((node?.data as MapNodeData).isDraft).toBe(false);
  });

  it('should delete a node and its connected edges', () => {
    useMapStore.getState().addNode({
      id: 'n1',
      type: 'goalNode',
      position: { x: 0, y: 0 },
      data: { label: 'G1', nodeType: 'goal', layer: 'orchestration' } as MapNodeData,
    });
    useMapStore.getState().addNode({
      id: 'n2',
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: { label: 'T1', nodeType: 'task', layer: 'execution' } as MapNodeData,
    });
    useMapStore.getState().addEdge({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      type: 'sequence',
    });

    useMapStore.getState().deleteNode('n1');
    expect(useMapStore.getState().nodes).toHaveLength(1);
    expect(useMapStore.getState().edges).toHaveLength(0);
  });

  it('should update node task status', () => {
    useMapStore.getState().addNode({
      id: 't1',
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Task',
        nodeType: 'task',
        layer: 'execution',
        taskStatus: 'gray',
      } as MapNodeData,
    });

    useMapStore.getState().updateNodeStatus('t1', 'running');
    const node = useMapStore.getState().nodes.find((n) => n.id === 't1');
    expect((node?.data as MapNodeData).taskStatus).toBe('blue');
  });

  it('should load a full graph', () => {
    useMapStore.getState().loadGraph(
      [
        { id: 'g1', type: 'goal', label: 'Goal 1', layer: 'orchestration', isDraft: false },
        { id: 't1', type: 'task', label: 'Task 1', layer: 'execution', isDraft: true },
      ],
      [
        { id: 'e1', source: 'g1', target: 't1', edgeType: 'sequence' },
      ],
    );

    const state = useMapStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.edges).toHaveLength(1);
    expect(state.isGenerating).toBe(false);
  });

  it('should adjust node data', () => {
    useMapStore.getState().addNode({
      id: 'adj-1',
      type: 'goalNode',
      position: { x: 0, y: 0 },
      data: { label: 'Old Label', nodeType: 'goal', layer: 'orchestration' } as MapNodeData,
    });

    useMapStore.getState().adjustNode('adj-1', { label: 'New Label' });
    const node = useMapStore.getState().nodes.find((n) => n.id === 'adj-1');
    expect((node?.data as MapNodeData).label).toBe('New Label');
  });

  it('should clear the map', () => {
    useMapStore.getState().addNode({
      id: 'n1',
      type: 'goalNode',
      position: { x: 0, y: 0 },
      data: { label: 'G', nodeType: 'goal', layer: 'orchestration' } as MapNodeData,
    });
    useMapStore.getState().clearMap();

    const state = useMapStore.getState();
    expect(state.nodes).toHaveLength(0);
    expect(state.edges).toHaveLength(0);
  });
});
