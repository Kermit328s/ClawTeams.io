// ============================================================
// Agent 画像构建 — 从数据库 + md 解析结果聚合
// ============================================================

import { Database } from '../store/database';
import { MdParser } from '../tracker/md-parser';
import {
  AgentIdentity,
  AgentSoul,
  AgentTools,
  HeartbeatConfig,
} from '../tracker/types';

export interface AgentProfile {
  agent_id: string;
  name: string;
  emoji: string;
  model: string;
  status: string;
  last_active_at: string | null;
  identity: AgentIdentity | null;
  soul: AgentSoul | null;
  tools: AgentTools | null;
  heartbeat: HeartbeatConfig | null;
  core_files: CoreFileSummary[];
  execution_stats: {
    today: ExecutionStatsPeriod;
    week: ExecutionStatsPeriod;
  };
  relations: AgentRelationView[];
}

export interface CoreFileSummary {
  file_type: string;
  version_count: number;
  last_changed_at: string;
}

export interface ExecutionStatsPeriod {
  total: number;
  succeeded: number;
  failed: number;
  total_tokens: number;
}

export interface AgentRelationView {
  target_agent_id: string;
  relation_type: string;
  strength: number;
}

interface DbAgent {
  agent_id: string;
  claw_id: string;
  name: string;
  emoji: string;
  model: string;
  status: string;
  last_active_at: string | null;
}

interface DbCoreFile {
  id: number;
  agent_id: string;
  file_type: string;
  file_path: string;
  current_content: string | null;
  current_hash: string;
  version_count: number;
  last_changed_at: string;
}

interface DbRelation {
  source_agent_id: string;
  target_agent_id: string;
  relation_type: string;
  strength: number;
}

/**
 * Agent 画像构建器
 */
export class AgentProfileBuilder {
  constructor(
    private db: Database,
    private mdParser: MdParser,
  ) {}

  /**
   * 构建完整 Agent 画像
   */
  buildProfile(agentId: string, clawId: string): AgentProfile {
    // 获取 Agent 基本信息
    const agent = this.db.getAgentProfile(agentId) as DbAgent | undefined;
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // 获取核心文件列表及其解析结果
    const coreFiles = this.db.getCoreFilesByAgentId(agentId) as DbCoreFile[];

    // 解析各核心文件
    const identity = this.parseCoreFile(coreFiles, 'identity') as AgentIdentity | null;
    const soul = this.parseCoreFile(coreFiles, 'soul') as AgentSoul | null;
    const tools = this.parseCoreFile(coreFiles, 'tools') as AgentTools | null;
    const heartbeat = this.parseCoreFile(coreFiles, 'heartbeat') as HeartbeatConfig | null;

    // 构建核心文件摘要
    const coreFileSummaries: CoreFileSummary[] = coreFiles.map(cf => ({
      file_type: cf.file_type,
      version_count: cf.version_count,
      last_changed_at: cf.last_changed_at,
    }));

    // 执行统计
    const executionStats = this.getExecutionStats(agentId);

    // 协作关系
    const relations = this.getRelations(agentId);

    return {
      agent_id: agent.agent_id,
      name: agent.name,
      emoji: agent.emoji,
      model: agent.model,
      status: agent.status,
      last_active_at: agent.last_active_at,
      identity,
      soul,
      tools,
      heartbeat,
      core_files: coreFileSummaries,
      execution_stats: executionStats,
      relations,
    };
  }

  /**
   * 获取执行统计（今日 + 本周）
   */
  getExecutionStats(agentId: string): {
    today: ExecutionStatsPeriod;
    week: ExecutionStatsPeriod;
  } {
    return {
      today: this.db.getExecutionStats(agentId, 'today'),
      week: this.db.getExecutionStats(agentId, 'week'),
    };
  }

  /**
   * 获取协作关系
   */
  getRelations(agentId: string): AgentRelationView[] {
    const relations = this.db.getAgentRelations(agentId) as DbRelation[];
    return relations.map(r => ({
      target_agent_id: r.source_agent_id === agentId ? r.target_agent_id : r.source_agent_id,
      relation_type: r.relation_type,
      strength: r.strength,
    }));
  }

  /**
   * 解析指定类型的核心文件
   */
  private parseCoreFile(coreFiles: DbCoreFile[], fileType: string): unknown | null {
    const file = coreFiles.find(cf => cf.file_type === fileType);
    if (!file || !file.current_content) return null;

    try {
      const result = this.mdParser.autoDetectAndParse(file.file_path, file.current_content);
      return result.data;
    } catch {
      return null;
    }
  }
}
