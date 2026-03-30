/**
 * 团队服务
 * 团队 CRUD 和成员管理
 */

import type { Pool } from 'pg';
import type { Session as Neo4jSession } from 'neo4j-driver';

export interface Team {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTeamRequest {
  name: string;
  owner_id: string;
  description?: string;
}

export interface TeamMember {
  user_id: string;
  team_id: string;
  joined_at: string;
}

export class TeamService {
  constructor(
    private readonly pg: Pool,
    private readonly neo4j: Neo4jSession,
  ) {}

  /** 创建团队 */
  async create(req: CreateTeamRequest): Promise<Team> {
    const result = await this.pg.query(
      `INSERT INTO teams (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, owner_id, is_active, created_at, updated_at`,
      [req.name, req.description ?? null, req.owner_id],
    );
    const team = this.mapRow(result.rows[0]);

    // 自动将 owner 加入 team_members
    await this.pg.query(
      `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [team.id, req.owner_id],
    );

    // 在 Neo4j 中创建 Team 节点和 OWNS 关系
    await this.neo4j.run(
      `MERGE (t:Team {id: $id})
       SET t.name = $name, t.description = $description, t.created_at = datetime()
       WITH t
       MATCH (u:User {id: $owner_id})
       MERGE (u)-[:OWNS]->(t)`,
      { id: team.id, name: req.name, description: req.description ?? '', owner_id: req.owner_id },
    );

    return team;
  }

  /** 获取团队详情 */
  async getById(teamId: string): Promise<Team | null> {
    const result = await this.pg.query(
      `SELECT id, name, description, owner_id, is_active, created_at, updated_at
       FROM teams WHERE id = $1 AND is_active = TRUE`,
      [teamId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /** 获取用户所属的所有团队 */
  async listByUser(userId: string): Promise<Team[]> {
    const result = await this.pg.query(
      `SELECT t.id, t.name, t.description, t.owner_id, t.is_active, t.created_at, t.updated_at
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = $1 AND t.is_active = TRUE`,
      [userId],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /** 添加团队成员 */
  async addMember(teamId: string, userId: string): Promise<void> {
    await this.pg.query(
      `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [teamId, userId],
    );
  }

  /** 移除团队成员 */
  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.pg.query(
      `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId],
    );
  }

  /** 列出团队成员 */
  async listMembers(teamId: string): Promise<TeamMember[]> {
    const result = await this.pg.query(
      `SELECT user_id, team_id, joined_at FROM team_members WHERE team_id = $1`,
      [teamId],
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      user_id: row.user_id as string,
      team_id: row.team_id as string,
      joined_at: (row.joined_at as Date).toISOString(),
    }));
  }

  private mapRow(row: Record<string, unknown>): Team {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      owner_id: row.owner_id as string,
      is_active: row.is_active as boolean,
      created_at: (row.created_at as Date).toISOString(),
      updated_at: (row.updated_at as Date).toISOString(),
    };
  }
}
