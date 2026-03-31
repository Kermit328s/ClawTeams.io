// ============================================================
// 工作流图 Store
// ============================================================

import { create } from 'zustand';
import type { WorkflowNode, WorkflowEdge, AgentStatus } from '../types';

interface GraphState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  generatedAt: number | null;

  setGraph: (nodes: WorkflowNode[], edges: WorkflowEdge[], generatedAt: number) => void;
  updateNodeStatus: (agentId: string, status: AgentStatus) => void;
  setNodeFileChanged: (agentId: string, changed: boolean) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  generatedAt: null,

  setGraph: (nodes, edges, generatedAt) => set({ nodes, edges, generatedAt }),

  updateNodeStatus: (agentId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.data.agent_id === agentId
          ? { ...n, data: { ...n.data, status } }
          : n,
      ),
    })),

  setNodeFileChanged: (agentId, changed) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.data.agent_id === agentId
          ? { ...n, data: { ...n.data, has_file_change: changed } }
          : n,
      ),
    })),
}));
