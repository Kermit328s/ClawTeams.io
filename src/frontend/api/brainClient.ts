/**
 * Brain API client — consumes contracts/brain-api.yaml
 */

const BASE_URL = '/api/v1';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = opts;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API Error: ${res.status}`);
  }

  return res.json();
}

// ─── Intent Graph ───

export interface CreateGoalRequest {
  title: string;
  description?: string;
  team_id: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  deadline?: string;
}

export interface Goal {
  goal_id: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  team_id: string;
  created_at: string;
}

export interface GoalDetail extends Goal {
  tasks: Array<{
    task_id: string;
    title: string;
    state: string;
    assigned_agent_id?: string;
  }>;
  edges: Array<{
    from_id: string;
    to_id: string;
    edge_type: string;
  }>;
}

export const brainApi = {
  // Goals
  createGoal: (data: CreateGoalRequest) =>
    request<Goal>('/intent/goals', { method: 'POST', body: data }),

  listGoals: (teamId: string, status?: string) => {
    const params = new URLSearchParams({ team_id: teamId });
    if (status) params.set('status', status);
    return request<Goal[]>(`/intent/goals?${params}`);
  },

  getGoal: (goalId: string) =>
    request<GoalDetail>(`/intent/goals/${goalId}`),

  decomposeGoal: (goalId: string) =>
    request<{ decomposition_id: string }>(`/intent/goals/${goalId}/decompose`, {
      method: 'POST',
    }),

  // Agents
  listAgents: (teamId: string) =>
    request<any[]>(`/agents?team_id=${teamId}`),

  // Cognition
  listCognitionSignals: (teamId: string) =>
    request<any[]>(`/cognition/signals?team_id=${teamId}`),

  // Knowledge
  searchKnowledge: (teamId: string, query: string, limit = 10) =>
    request<any[]>('/knowledge/search', {
      method: 'POST',
      body: { team_id: teamId, query, limit },
    }),

  // Teams
  createTeam: (data: { name: string; owner_id: string; description?: string }) =>
    request<any>('/teams', { method: 'POST', body: data }),
};
