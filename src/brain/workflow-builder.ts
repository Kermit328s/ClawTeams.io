// ============================================================
// 工作流图自动生成 — 从 md + 运行数据合并
// ============================================================

import { Database } from '../store/database';
import { MdParser } from '../tracker/md-parser';

export interface WorkflowNode {
  id: string;
  agent_id: string;
  name: string;
  emoji: string;
  status: string;
  type: 'agent';
}

export interface WorkflowEdge {
  source: string;
  target: string;
  relation_type: string;
  strength: number;
  label: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface DbAgent {
  agent_id: string;
  name: string;
  emoji: string;
  status: string;
}

interface DbRelation {
  source_agent_id: string;
  target_agent_id: string;
  relation_type: string;
  strength: number;
  source_info: string | null;
}

interface DbCoreFile {
  agent_id: string | null;
  file_type: string;
  file_path: string;
  current_content: string | null;
}

/**
 * 工作流图生成器
 */
export class WorkflowBuilder {
  constructor(
    private db: Database,
    private mdParser: MdParser,
  ) {}

  /**
   * 生成工作流图
   */
  buildGraph(workspaceId: string): WorkflowGraph {
    // 获取所有 Agent 作为节点
    const agents = this.db.getAllAgentsForWorkspace(workspaceId) as DbAgent[];
    // 如果 workspace 下没有 agent，返回所有 agent
    const allAgents = agents.length > 0 ? agents : this.db.getAllAgentsForWorkspace() as DbAgent[];

    const nodes: WorkflowNode[] = allAgents.map(agent => ({
      id: agent.agent_id,
      agent_id: agent.agent_id,
      name: agent.name,
      emoji: agent.emoji,
      status: agent.status,
      type: 'agent' as const,
    }));

    // 提取静态关系（from md files）
    const staticEdges = this.extractStaticRelations();

    // 提取动态关系（from runtime data）
    const dynamicEdges = this.extractDynamicRelations(workspaceId);

    // 合并去重
    const edges = this.mergeEdges(staticEdges, dynamicEdges);

    return { nodes, edges };
  }

  /**
   * 数据源1：从 md 文件提取静态协作关系
   */
  private extractStaticRelations(): WorkflowEdge[] {
    const edges: WorkflowEdge[] = [];

    // 查找所有 agents_protocol / agent_network 类型的 core_files
    const coreFiles = this.db.getCoreFiles() as DbCoreFile[];

    for (const file of coreFiles) {
      if (!file.current_content) continue;

      try {
        const parsed = this.mdParser.autoDetectAndParse(file.file_path, file.current_content);

        if (parsed.type === 'agent_network' && parsed.data) {
          const network = parsed.data as { edges?: { from: string; to: string; relation: string }[] };
          if (network.edges) {
            for (const edge of network.edges) {
              edges.push({
                source: edge.from,
                target: edge.to,
                relation_type: 'collaboration',
                strength: 1,
                label: edge.relation,
              });
            }
          }
        }
      } catch {
        // 解析失败，跳过
      }
    }

    return edges;
  }

  /**
   * 数据源2：从运行时数据提取动态关系
   */
  private extractDynamicRelations(workspaceId: string): WorkflowEdge[] {
    const relations = this.db.getAllRelationsForWorkspace(workspaceId) as DbRelation[];
    // 如果 workspace 下没有关系，获取所有
    const allRelations = relations.length > 0 ? relations : this.db.getAllRelationsForWorkspace() as DbRelation[];

    return allRelations.map(r => ({
      source: r.source_agent_id,
      target: r.target_agent_id,
      relation_type: r.relation_type,
      strength: r.strength,
      label: r.source_info ?? r.relation_type,
    }));
  }

  /**
   * 合并去重
   */
  private mergeEdges(staticEdges: WorkflowEdge[], dynamicEdges: WorkflowEdge[]): WorkflowEdge[] {
    const edgeMap = new Map<string, WorkflowEdge>();

    for (const edge of staticEdges) {
      const key = `${edge.source}->${edge.target}:${edge.relation_type}`;
      edgeMap.set(key, edge);
    }

    for (const edge of dynamicEdges) {
      const key = `${edge.source}->${edge.target}:${edge.relation_type}`;
      const existing = edgeMap.get(key);
      if (existing) {
        // 合并：取更大的 strength，保留动态 label
        existing.strength = Math.max(existing.strength, edge.strength);
        if (edge.label && edge.label !== edge.relation_type) {
          existing.label = edge.label;
        }
      } else {
        edgeMap.set(key, edge);
      }
    }

    return Array.from(edgeMap.values());
  }
}
