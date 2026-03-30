import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type {
  MapNodeData,
  MapNodeType,
  MapLayer,
  TaskColorStatus,
  CognitionVisualState,
  MapEdgeType,
} from '@/types';
import type { TaskState } from '@shared/intent-graph';

/** Maps backend TaskState to visual color status */
function taskStateToColor(state: TaskState): TaskColorStatus {
  switch (state) {
    case 'pending':
    case 'cancelled':
      return 'gray';
    case 'assigned':
    case 'running':
      return 'blue';
    case 'completed':
      return 'green';
    case 'failed':
    case 'blocked':
      return 'red';
    case 'human_required':
      return 'yellow';
    default:
      return 'gray';
  }
}

/** Maps backend IntentEdgeType to frontend MapEdgeType */
function edgeTypeToMapType(edgeType: string): MapEdgeType {
  switch (edgeType) {
    case 'DEPENDS_ON':
      return 'sequence';
    case 'PARALLEL_WITH':
      return 'parallel';
    case 'CONDITION':
      return 'condition';
    case 'AGGREGATES':
      return 'aggregate';
    case 'LOOP_BACK':
      return 'loop';
    default:
      return 'sequence';
  }
}

interface MapState {
  /** React Flow nodes */
  nodes: Node<MapNodeData>[];
  /** React Flow edges */
  edges: Edge[];
  /** Selected node ID */
  selectedNodeId: string | null;
  /** Whether the detail panel is open */
  detailPanelOpen: boolean;
  /** Map is loading (AI generating) */
  isGenerating: boolean;

  // ─── Actions ───
  setNodes: (nodes: Node<MapNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: any[]) => void;
  onEdgesChange: (changes: any[]) => void;
  selectNode: (id: string | null) => void;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  confirmNode: (id: string) => void;
  adjustNode: (id: string, data: Partial<MapNodeData>) => void;
  deleteNode: (id: string) => void;
  addNode: (node: Node<MapNodeData>) => void;
  addEdge: (edge: Edge) => void;
  updateNodeStatus: (nodeId: string, taskState: TaskState) => void;
  updateCognitionState: (nodeId: string, state: CognitionVisualState) => void;
  setGenerating: (v: boolean) => void;
  /** Load a full graph from API response */
  loadGraph: (
    nodes: Array<{
      id: string;
      type: MapNodeType;
      label: string;
      description?: string;
      layer: MapLayer;
      taskStatus?: TaskColorStatus;
      isDraft?: boolean;
      x?: number;
      y?: number;
    }>,
    edges: Array<{
      id: string;
      source: string;
      target: string;
      edgeType: MapEdgeType;
    }>,
  ) => void;
  /** Clear the map */
  clearMap: () => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  detailPanelOpen: false,
  isGenerating: false,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => {
    // We use reactflow's applyNodeChanges utility in the component
    // This is a simplified version for the store
    set((s) => {
      const updated = [...s.nodes];
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          const idx = updated.findIndex((n) => n.id === change.id);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], position: change.position };
          }
        }
        if (change.type === 'select') {
          const idx = updated.findIndex((n) => n.id === change.id);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], selected: change.selected };
          }
        }
      }
      return { nodes: updated };
    });
  },

  onEdgesChange: (changes) => {
    set((s) => {
      let updated = [...s.edges];
      for (const change of changes) {
        if (change.type === 'remove') {
          updated = updated.filter((e) => e.id !== change.id);
        }
      }
      return { edges: updated };
    });
  },

  selectNode: (id) =>
    set({ selectedNodeId: id, detailPanelOpen: id !== null }),

  openDetailPanel: () => set({ detailPanelOpen: true }),
  closeDetailPanel: () => set({ detailPanelOpen: false, selectedNodeId: null }),

  confirmNode: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, isDraft: false } }
          : n,
      ),
    })),

  adjustNode: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    })),

  deleteNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      detailPanelOpen: s.selectedNodeId === id ? false : s.detailPanelOpen,
    })),

  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),

  addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),

  updateNodeStatus: (nodeId, taskState) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                taskStatus: taskStateToColor(taskState),
              },
            }
          : n,
      ),
    })),

  updateCognitionState: (nodeId, state) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, cognitionState: state } }
          : n,
      ),
    })),

  setGenerating: (v) => set({ isGenerating: v }),

  loadGraph: (nodeData, edgeData) => {
    const nodes: Node<MapNodeData>[] = nodeData.map((n, i) => ({
      id: n.id,
      type: `${n.type}Node`,
      position: { x: n.x ?? 200 + (i % 3) * 280, y: n.y ?? 80 + Math.floor(i / 3) * 160 },
      data: {
        label: n.label,
        description: n.description,
        nodeType: n.type,
        layer: n.layer,
        taskStatus: n.taskStatus ?? 'gray',
        isDraft: n.isDraft ?? false,
      },
    }));

    const edges: Edge[] = edgeData.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.edgeType,
      animated: e.edgeType === 'parallel' || e.edgeType === 'loop',
    }));

    set({ nodes, edges, isGenerating: false });
  },

  clearMap: () => set({ nodes: [], edges: [], selectedNodeId: null, detailPanelOpen: false }),
}));

export { taskStateToColor, edgeTypeToMapType };
