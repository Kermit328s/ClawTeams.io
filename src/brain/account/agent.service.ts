/**
 * 龙虾账号服务
 * 创建、API Key 生成、能力声明注册、"创建即纳管"
 */

import type { Pool } from 'pg';
import type { Session as Neo4jSession } from 'neo4j-driver';
import {
  type AgentIdentity,
  type AgentCapability,
  type CreateAgentRequest,
  type CreateAgentResponse,
  type AgentStatus,
} from '../../infra/shared';
import { generateApiKey, hashApiKey, extractKeyPrefix } from '../../infra/gateway/api-key-auth';

// ─── 龙虾账号所有权 ───
export interface AgentOwnership {
  agent_id: string;
  owner_id: string | null;
  team_id: string;
}

export interface TransferOwnerRequest {
  agent_id: string;
  new_owner_id: string;
}

export interface AgentListFilter {
  team_id: string;
  status?: AgentStatus;
  owner_id?: string;
}

// ─── 龙虾账号服务 ───
export class AgentService {
  constructor(
    private readonly pg: Pool,
    private readonly neo4j: Neo4jSession,
  ) {}

  /**
   * 创建龙虾 — "创建即纳管"
   * 1. 在 PostgreSQL 中创建账号记录
   * 2. 在 Neo4j 中注册 Agent 节点
   * 3. 返回明文 API Key（仅此一次）
   */
  async create(req: CreateAgentRequest, ownerId: string): Promise<CreateAgentResponse> {
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = extractKeyPrefix(apiKey);

    // 1. PostgreSQL 插入
    const pgResult = await this.pg.query(
      `INSERT INTO agents (name, team_id, api_key_hash, api_key_prefix, capabilities)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, team_id, status, capabilities, is_active, created_at, updated_at, last_active_at`,
      [req.name, req.team_id, apiKeyHash, apiKeyPrefix, JSON.stringify(req.capabilities)],
    );
    const row = pgResult.rows[0];
    const agentId = row.id as string;

    // 2. 建立 owner 绑定关系（agent_owners 通过 permission_bindings 表间接实现）
    // 这里存到自定义的 agent_owners 逻辑：直接用 Neo4j 关系表示
    await this.neo4j.run(
      `CREATE (a:Agent {
        id: $id,
        name: $name,
        status: 'offline',
        team_id: $team_id,
        capabilities: $capabilities,
        created_at: datetime(),
        last_active_at: null
      })
      WITH a
      MATCH (t:Team {id: $team_id})
      MERGE (a)-[:BELONGS_TO]->(t)
      WITH a
      MATCH (u:User {id: $owner_id})
      MERGE (u)-[:OWNS]->(a)`,
      {
        id: agentId,
        name: req.name,
        team_id: req.team_id,
        capabilities: JSON.stringify(req.capabilities),
        owner_id: ownerId,
      },
    );

    const identity: CreateAgentResponse = {
      agent_id: agentId,
      name: row.name,
      team_id: row.team_id,
      status: row.status as AgentStatus,
      capabilities: req.capabilities,
      roles: [],
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      created_at: (row.created_at as Date).toISOString(),
      last_active_at: undefined,
      api_key: apiKey, // 明文，仅此一次
    };

    return identity;
  }

  /** 获取龙虾详情 */
  async getById(agentId: string): Promise<AgentIdentity | null> {
    const result = await this.pg.query(
      `SELECT id, name, team_id, status, capabilities, api_key_hash, api_key_prefix,
              is_active, created_at, updated_at, last_active_at
       FROM agents WHERE id = $1 AND is_active = TRUE`,
      [agentId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /** 列出团队龙虾 */
  async list(filter: AgentListFilter): Promise<AgentIdentity[]> {
    const conditions = ['a.team_id = $1', 'a.is_active = TRUE'];
    const params: unknown[] = [filter.team_id];
    let idx = 2;

    if (filter.status) {
      conditions.push(`a.status = $${idx++}`);
      params.push(filter.status);
    }

    let query = `SELECT a.id, a.name, a.team_id, a.status, a.capabilities,
                        a.api_key_hash, a.api_key_prefix, a.created_at, a.updated_at, a.last_active_at
                 FROM agents a`;

    if (filter.owner_id) {
      // 通过 Neo4j OWNS 关系过滤
      const neo4jResult = await this.neo4j.run(
        `MATCH (u:User {id: $owner_id})-[:OWNS]->(a:Agent)
         RETURN a.id AS agent_id`,
        { owner_id: filter.owner_id },
      );
      const ownedIds = neo4jResult.records.map((r) => r.get('agent_id') as string);
      if (ownedIds.length === 0) return [];
      conditions.push(`a.id = ANY($${idx++})`);
      params.push(ownedIds);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    const result = await this.pg.query(query, params);
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /** 更新龙虾能力声明 */
  async updateCapabilities(agentId: string, capabilities: AgentCapability[]): Promise<AgentIdentity> {
    const result = await this.pg.query(
      `UPDATE agents SET capabilities = $1 WHERE id = $2 AND is_active = TRUE
       RETURNING id, name, team_id, status, capabilities, api_key_hash, api_key_prefix, created_at, updated_at, last_active_at`,
      [JSON.stringify(capabilities), agentId],
    );
    if (result.rows.length === 0) {
      throw new AgentError('AGENT_NOT_FOUND', 'Agent not found');
    }

    // 同步更新 Neo4j
    await this.neo4j.run(
      `MATCH (a:Agent {id: $id}) SET a.capabilities = $capabilities`,
      { id: agentId, capabilities: JSON.stringify(capabilities) },
    );

    return this.mapRow(result.rows[0]);
  }

  /** 更新龙虾状态 */
  async updateStatus(agentId: string, status: AgentStatus): Promise<void> {
    await this.pg.query(
      `UPDATE agents SET status = $1, last_active_at = NOW() WHERE id = $2`,
      [status, agentId],
    );
    await this.neo4j.run(
      `MATCH (a:Agent {id: $id}) SET a.status = $status, a.last_active_at = datetime()`,
      { id: agentId, status },
    );
  }

  /** 重新生成 API Key */
  async regenerateApiKey(agentId: string): Promise<string> {
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = extractKeyPrefix(apiKey);

    const result = await this.pg.query(
      `UPDATE agents SET api_key_hash = $1, api_key_prefix = $2 WHERE id = $3 AND is_active = TRUE
       RETURNING id`,
      [apiKeyHash, apiKeyPrefix, agentId],
    );
    if (result.rows.length === 0) {
      throw new AgentError('AGENT_NOT_FOUND', 'Agent not found');
    }

    return apiKey;
  }

  /** 转让龙虾所有权 */
  async transferOwnership(req: TransferOwnerRequest): Promise<void> {
    // 移除旧 OWNS 关系，建立新的
    await this.neo4j.run(
      `MATCH (oldOwner:User)-[r:OWNS]->(a:Agent {id: $agent_id})
       DELETE r
       WITH a
       MATCH (newOwner:User {id: $new_owner_id})
       MERGE (newOwner)-[:OWNS]->(a)`,
      { agent_id: req.agent_id, new_owner_id: req.new_owner_id },
    );
  }

  /** 解绑所有者（人员离职） */
  async unbindOwner(agentId: string): Promise<void> {
    await this.neo4j.run(
      `MATCH (u:User)-[r:OWNS]->(a:Agent {id: $agent_id}) DELETE r`,
      { agent_id: agentId },
    );
  }

  /** 获取龙虾的当前所有者 */
  async getOwner(agentId: string): Promise<string | null> {
    const result = await this.neo4j.run(
      `MATCH (u:User)-[:OWNS]->(a:Agent {id: $agent_id}) RETURN u.id AS owner_id`,
      { agent_id: agentId },
    );
    return result.records.length > 0 ? (result.records[0].get('owner_id') as string) : null;
  }

  /** 人员离职流程：解绑所有龙虾 */
  async handleUserDeparture(userId: string): Promise<string[]> {
    // 获取该用户拥有的所有龙虾
    const result = await this.neo4j.run(
      `MATCH (u:User {id: $user_id})-[:OWNS]->(a:Agent) RETURN a.id AS agent_id`,
      { user_id: userId },
    );
    const agentIds = result.records.map((r) => r.get('agent_id') as string);

    // 解绑所有
    await this.neo4j.run(
      `MATCH (u:User {id: $user_id})-[r:OWNS]->(a:Agent) DELETE r`,
      { user_id: userId },
    );

    return agentIds; // 返回需要重新分配 owner 的龙虾列表
  }

  /** 停用龙虾 */
  async deactivate(agentId: string): Promise<void> {
    await this.pg.query(
      `UPDATE agents SET is_active = FALSE, status = 'offline' WHERE id = $1`,
      [agentId],
    );
    await this.neo4j.run(
      `MATCH (a:Agent {id: $id}) SET a.status = 'offline'`,
      { id: agentId },
    );
  }

  private mapRow(row: Record<string, unknown>): AgentIdentity {
    const capabilities =
      typeof row.capabilities === 'string'
        ? JSON.parse(row.capabilities as string)
        : row.capabilities;
    return {
      agent_id: row.id as string,
      name: row.name as string,
      team_id: row.team_id as string,
      status: row.status as AgentStatus,
      capabilities: Array.isArray(capabilities) ? capabilities : [],
      roles: [],
      api_key_hash: row.api_key_hash as string,
      api_key_prefix: row.api_key_prefix as string,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string),
      last_active_at: row.last_active_at
        ? (row.last_active_at instanceof Date ? row.last_active_at.toISOString() : (row.last_active_at as string))
        : undefined,
    };
  }
}

// ─── 龙虾错误 ───
export class AgentError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.statusCode = code === 'AGENT_NOT_FOUND' ? 404 : 400;
  }
}
