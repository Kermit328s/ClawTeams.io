// ============================================================
// 工作流图类型定义 — React Flow 兼容
// ============================================================

/**
 * React Flow 兼容的 Agent 节点
 */
export interface WorkflowNode {
  id: string;
  type: 'agent';
  position: { x: number; y: number };
  data: {
    agent_id: string;
    name: string;
    emoji: string;
    role: string;
    status: 'idle' | 'running' | 'failed';
    model: string;
    is_crosscut: boolean;
    execution_stats: {
      today_total: number;
      today_succeeded: number;
      today_failed: number;
    };
  };
}

/**
 * React Flow 兼容的边
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: 'collaboration' | 'subagent' | 'data_flow' | 'sequence';
  data: {
    label: string;
    strength: number;
    source_info: string;
  };
  animated?: boolean;
  style?: Record<string, unknown>;
}

/**
 * 完整工作流图
 */
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: {
    generated_at: number;
    static_edge_count: number;
    dynamic_edge_count: number;
    data_sources: string[];
  };
}

/**
 * 从 md 中提取的原始关系
 */
export interface ExtractedRelation {
  from: string;
  to: string;
  relation: string;
  type: 'collaboration' | 'subagent' | 'data_flow' | 'sequence';
  source_file: string;
}

/**
 * 从 md 中提取的原始节点信息
 */
export interface ExtractedNode {
  agent_id: string;
  name: string;
  role: string;
  is_crosscut: boolean;
  outputs: string[];
}

/**
 * Agent 角色名到 agent_id 的映射表条目
 */
export interface AgentAlias {
  alias: string;
  agent_id: string;
}

/**
 * 边样式配置（按类型）
 */
export const EDGE_STYLES: Record<WorkflowEdge['type'], { stroke: string; strokeWidth: number }> = {
  collaboration: { stroke: '#6366f1', strokeWidth: 2 },
  subagent: { stroke: '#f59e0b', strokeWidth: 2 },
  data_flow: { stroke: '#10b981', strokeWidth: 1.5 },
  sequence: { stroke: '#94a3b8', strokeWidth: 1 },
};
