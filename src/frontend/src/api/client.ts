// ============================================================
// ClawTeams API 客户端
// ============================================================

const API_BASE = '/api/v1';

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function buildQuery(params?: Record<string, string>): string {
  if (!params) return '';
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  // Workspaces
  getWorkspaces: () => request<unknown[]>(`${API_BASE}/workspaces`),

  // Claws
  getClaws: (wsId: string) =>
    request<unknown[]>(`${API_BASE}/workspaces/${wsId}/claws`),

  // Agent profile
  getAgentProfile: (id: string) =>
    request<unknown>(`${API_BASE}/agents/${id}`),

  // Agent core files
  getAgentCoreFiles: (id: string) =>
    request<unknown[]>(`${API_BASE}/agents/${id}/core-files`),

  getCoreFile: (agentId: string, type: string) =>
    request<unknown>(`${API_BASE}/agents/${agentId}/core-files/${type}`),

  getCoreFileVersions: (agentId: string, type: string) =>
    request<unknown[]>(`${API_BASE}/agents/${agentId}/core-files/${type}/versions`),

  // Workflow graph
  getWorkflowGraph: (wsId: string) =>
    request<unknown>(`${API_BASE}/workspaces/${wsId}/workflow-graph`),

  // Executions
  getExecutions: (wsId: string, params?: Record<string, string>) =>
    request<unknown[]>(`${API_BASE}/workspaces/${wsId}/executions${buildQuery(params)}`),

  // Artifacts
  getArtifacts: (wsId: string, params?: Record<string, string>) =>
    request<unknown[]>(`${API_BASE}/workspaces/${wsId}/artifacts${buildQuery(params)}`),

  // Activity log
  getActivity: (wsId: string, limit?: number) =>
    request<unknown[]>(`${API_BASE}/workspaces/${wsId}/activity${limit ? `?limit=${limit}` : ''}`),
};
