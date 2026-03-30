/**
 * 知识沉淀服务
 * 已验证信息、决策依据、历史结论与经验的读写
 */

import type { Session as Neo4jSession } from 'neo4j-driver';
import type { CognitionRecord } from '../../infra/shared';

// ─── 知识节点（基于 Cognition 节点扩展，verified=true 的认知即为知识） ───
export interface KnowledgeNode {
  node_id: string;
  content: string;
  source_task_id?: string;
  confidence: number;
  tags: string[];
  team_id: string;
  verified: boolean;
  verified_by?: string;
  reference_count: number;
  relevance_score?: number; // 搜索时返回
  created_at: string;
}

export interface CreateKnowledgeRequest {
  content: string;
  source_task_id?: string;
  confidence: number;
  tags: string[];
  team_id: string;
  verified_by?: string;
}

export interface KnowledgeSearchRequest {
  query: string;
  team_id: string;
  limit?: number;
  tags?: string[];
}

export class KnowledgeService {
  constructor(private readonly neo4j: Neo4jSession) {}

  /** 创建知识节点（已验证的认知） */
  async create(req: CreateKnowledgeRequest): Promise<KnowledgeNode> {
    const result = await this.neo4j.run(
      `CREATE (c:Cognition {
        id: randomUUID(),
        content: $content,
        source_task_id: $source_task_id,
        confidence: $confidence,
        tags: $tags,
        team_id: $team_id,
        verified: true,
        verified_by: $verified_by,
        reference_count: 0,
        created_at: datetime(),
        updated_at: datetime()
      }) RETURN c`,
      {
        content: req.content,
        source_task_id: req.source_task_id ?? null,
        confidence: req.confidence,
        tags: req.tags,
        team_id: req.team_id,
        verified_by: req.verified_by ?? null,
      },
    );

    return this.mapNode(result.records[0].get('c').properties);
  }

  /** 搜索知识（使用全文索引） */
  async search(req: KnowledgeSearchRequest): Promise<KnowledgeNode[]> {
    const limit = req.limit ?? 10;

    // 使用 Neo4j 全文索引搜索
    const result = await this.neo4j.run(
      `CALL db.index.fulltext.queryNodes('cognition_fulltext', $query)
       YIELD node, score
       WHERE node.team_id = $team_id AND node.verified = true
       ${req.tags && req.tags.length > 0 ? 'AND ANY(tag IN node.tags WHERE tag IN $tags)' : ''}
       RETURN node, score
       ORDER BY score DESC
       LIMIT $limit`,
      {
        query: req.query,
        team_id: req.team_id,
        tags: req.tags ?? [],
        limit: limit,
      },
    );

    return result.records.map((r) => {
      const node = this.mapNode(r.get('node').properties);
      node.relevance_score = r.get('score') as number;
      return node;
    });
  }

  /** 获取知识节点详情 */
  async getById(nodeId: string): Promise<KnowledgeNode | null> {
    const result = await this.neo4j.run(
      `MATCH (c:Cognition {id: $id, verified: true}) RETURN c`,
      { id: nodeId },
    );
    return result.records.length > 0 ? this.mapNode(result.records[0].get('c').properties) : null;
  }

  /** 增加引用计数（被其他任务参考时） */
  async incrementReferenceCount(nodeId: string): Promise<void> {
    await this.neo4j.run(
      `MATCH (c:Cognition {id: $id}) SET c.reference_count = c.reference_count + 1`,
      { id: nodeId },
    );
  }

  /** 按团队列出知识（按引用次数排序） */
  async listByTeam(teamId: string, limit: number = 50): Promise<KnowledgeNode[]> {
    const result = await this.neo4j.run(
      `MATCH (c:Cognition {team_id: $team_id, verified: true})
       RETURN c
       ORDER BY c.reference_count DESC, c.created_at DESC
       LIMIT $limit`,
      { team_id: teamId, limit },
    );
    return result.records.map((r) => this.mapNode(r.get('c').properties));
  }

  private mapNode(props: Record<string, unknown>): KnowledgeNode {
    return {
      node_id: props.id as string,
      content: props.content as string,
      source_task_id: props.source_task_id as string | undefined,
      confidence: (props.confidence as number) ?? 0,
      tags: (props.tags as string[]) ?? [],
      team_id: props.team_id as string,
      verified: (props.verified as boolean) ?? false,
      verified_by: props.verified_by as string | undefined,
      reference_count: (props.reference_count as number) ?? 0,
      created_at: props.created_at ? String(props.created_at) : '',
    };
  }
}
