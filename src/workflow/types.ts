// ============================================================
// 工作流图类型定义 — React Flow 兼容
// ============================================================

/**
 * 技能节点数据（"电视机"小卡片）
 */
export interface SkillNodeData {
  skill_id: string;           // 如 "trigger-discover-signal"
  agent_id: string;           // 所属 Agent
  agent_emoji: string;
  agent_name: string;
  skill_name: string;         // "发现信号"
  skill_icon: string;         // "🔍"
  skill_index: number;        // 在链中的位置（0,1,2...）
  skill_total: number;        // 该 Agent 的技能总数
  status: 'idle' | 'running' | 'completed';
  is_crosscut: boolean;
  agent_color: string;        // 该 Agent 统一色条颜色
  // 电视屏幕内容
  latest_artifact?: {
    name: string;
    type: string;             // document/data/media
    preview: string;          // 前100字或描述
    timestamp: string;
  };
  execution_stats: {
    total: number;
    succeeded: number;
    failed: number;
    tokens: number;
  };
}

/**
 * React Flow 兼容的技能节点
 */
export interface WorkflowNode {
  id: string;
  type: 'skill';
  position: { x: number; y: number };
  data: SkillNodeData;
  parentId?: string;          // React Flow group 归属
}

/**
 * Agent 分组节点（用于 React Flow group 可视化分组背景）
 */
export interface AgentGroupNode {
  id: string;
  type: 'agent-group';
  position: { x: number; y: number };
  data: {
    agent_id: string;
    agent_name: string;
    agent_emoji: string;
    agent_color: string;
    is_crosscut: boolean;
    skill_count: number;
  };
  style: { width: number; height: number };
}

/**
 * 边的类型
 */
export type WorkflowEdgeType = 'internal' | 'cross_agent' | 'crosscut' | 'collaboration' | 'subagent' | 'data_flow' | 'sequence';

/**
 * React Flow 兼容的边
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: WorkflowEdgeType;
  data: {
    label: string;
    strength: number;
    source_info: string;
    last_transfer?: string;
  };
  animated?: boolean;
  style?: Record<string, unknown>;
}

/**
 * 完整工作流图
 */
export interface WorkflowGraph {
  nodes: (WorkflowNode | AgentGroupNode)[];
  edges: WorkflowEdge[];
  metadata: {
    generated_at: number;
    static_edge_count: number;
    dynamic_edge_count: number;
    data_sources: string[];
  };
}

/**
 * 从工作定义 md 提取的技能定义
 */
export interface ExtractedSkill {
  skill_name: string;
  skill_icon: string;
  skill_index: number;
}

/**
 * 一个 Agent 的完整技能链
 */
export interface AgentSkillChain {
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  is_crosscut: boolean;
  skills: ExtractedSkill[];
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
 * Agent 统一色条颜色映射
 */
export const AGENT_COLORS: Record<string, string> = {
  'trigger': '#F59E0B',   // 琥珀
  'variable': '#8B5CF6',  // 紫色
  'industry': '#10B981',  // 翡翠绿
  'asset': '#3B82F6',     // 蓝色
  'redteam': '#EF4444',   // 红色
  'default': '#64748B',   // 灰色
};

/**
 * 技能图标映射（根据技能名猜测图标）
 */
export const SKILL_ICONS: Record<string, string> = {
  '发现': '🔍',
  '信号': '🔍',
  '筛选': '🔬',
  '假设': '💡',
  '交付': '📋',
  '接收': '📥',
  '识别': '🔎',
  '分析': '⚙️',
  '传导': '🔗',
  '迁移': '💰',
  '映射': '🗺️',
  '候选': '📊',
  '挑战': '🔍',
  '质疑': '🔍',
  '报告': '📄',
  '构建': '🏗️',
  '排除': '🚫',
  '扩散': '📡',
  '区分': '🔎',
  '解释': '💡',
};

/**
 * 边样式配置（按类型）
 */
export const EDGE_STYLES: Record<string, { stroke: string; strokeWidth: number; dashArray?: string }> = {
  internal: { stroke: '#475569', strokeWidth: 1.5 },
  cross_agent: { stroke: '#818CF8', strokeWidth: 3 },
  crosscut: { stroke: '#EF4444', strokeWidth: 2, dashArray: '6 4' },
  collaboration: { stroke: '#6366f1', strokeWidth: 2 },
  subagent: { stroke: '#f59e0b', strokeWidth: 2 },
  data_flow: { stroke: '#10b981', strokeWidth: 1.5 },
  sequence: { stroke: '#94a3b8', strokeWidth: 1 },
};
