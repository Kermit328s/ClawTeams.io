// ============================================================
// 工作流图 Store — 技能级版本
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
      nodes: state.nodes.map((n) => {
        // 只更新技能节点，不更新 group 节点
        if (n.type !== 'skill') return n;
        const data = n.data as { agent_id?: string; status?: string };
        if (data.agent_id === agentId) {
          return { ...n, data: { ...n.data, status } };
        }
        return n;
      }),
    })),

  setNodeFileChanged: (agentId, changed) =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.type !== 'skill') return n;
        const data = n.data as { agent_id?: string };
        if (data.agent_id === agentId) {
          return { ...n, data: { ...n.data, has_file_change: changed } };
        }
        return n;
      }),
    })),
}));
