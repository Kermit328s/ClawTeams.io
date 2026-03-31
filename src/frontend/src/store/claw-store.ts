// ============================================================
// Claw & Agent 状态 Store
// ============================================================

import { create } from 'zustand';
import type { Claw, Agent, ClawStatus, AgentStatus, DetailTarget, ViewType } from '../types';

interface ClawState {
  // Data
  claws: Claw[];
  workspaceId: string | null;
  wsConnectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';

  // UI state
  activeView: ViewType;
  detailTarget: DetailTarget | null;
  hoveredAgentId: string | null;

  // Actions
  setClaws: (claws: Claw[]) => void;
  setWorkspaceId: (id: string) => void;
  setWsConnectionStatus: (status: ClawState['wsConnectionStatus']) => void;
  updateClawStatus: (clawId: string, status: ClawStatus) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus, currentTask?: string) => void;
  setAgentFileChanged: (agentId: string, changed: boolean) => void;
  setActiveView: (view: ViewType) => void;
  setDetailTarget: (target: DetailTarget | null) => void;
  setHoveredAgentId: (id: string | null) => void;
  getAgent: (agentId: string) => Agent | undefined;
  getAllAgents: () => Agent[];
}

export const useClawStore = create<ClawState>((set, get) => ({
  claws: [],
  workspaceId: null,
  wsConnectionStatus: 'disconnected',
  activeView: 'topology',
  detailTarget: null,
  hoveredAgentId: null,

  setClaws: (claws) => set({ claws }),
  setWorkspaceId: (id) => set({ workspaceId: id }),
  setWsConnectionStatus: (status) => set({ wsConnectionStatus: status }),

  updateClawStatus: (clawId, status) =>
    set((state) => ({
      claws: state.claws.map((c) =>
        c.claw_id === clawId ? { ...c, status } : c,
      ),
    })),

  updateAgentStatus: (agentId, status, currentTask) =>
    set((state) => ({
      claws: state.claws.map((c) => ({
        ...c,
        agents: c.agents.map((a) =>
          a.agent_id === agentId
            ? { ...a, status, current_task: currentTask ?? a.current_task }
            : a,
        ),
      })),
    })),

  setAgentFileChanged: (agentId, changed) =>
    set((state) => ({
      claws: state.claws.map((c) => ({
        ...c,
        agents: c.agents.map((a) =>
          a.agent_id === agentId ? { ...a, has_file_change: changed } : a,
        ),
      })),
    })),

  setActiveView: (view) => set({ activeView: view }),
  setDetailTarget: (target) => set({ detailTarget: target }),
  setHoveredAgentId: (id) => set({ hoveredAgentId: id }),

  getAgent: (agentId) => {
    for (const claw of get().claws) {
      const agent = claw.agents.find((a) => a.agent_id === agentId);
      if (agent) return agent;
    }
    return undefined;
  },

  getAllAgents: () => get().claws.flatMap((c) => c.agents),
}));
