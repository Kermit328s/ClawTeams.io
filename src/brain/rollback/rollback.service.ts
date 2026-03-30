/**
 * 回滚机制服务
 * - 单龙虾回滚：恢复指定时间点状态
 * - 团队整体回滚：同步回滚所有相关龙虾
 */

import type { Pool } from 'pg';
import type { Session as Neo4jSession } from 'neo4j-driver';

// ─── 回滚请求 ───
export interface SingleAgentRollbackRequest {
  /** 龙虾 ID */
  agent_id: string;
  /** 目标任务 ID */
  task_id: string;
  /** 回滚到的目标版本号 */
  target_version: number;
  /** 回滚原因 */
  reason: string;
  /** 发起人 ID */
  initiated_by: string;
}

export interface TeamRollbackRequest {
  /** 团队 ID */
  team_id: string;
  /** 回滚到的时间点（ISO 8601） */
  target_timestamp: string;
  /** 回滚原因 */
  reason: string;
  /** 发起人 ID */
  initiated_by: string;
  /** 仅回滚指定目标下的任务（可选） */
  goal_id?: string;
}

// ─── 回滚结果 ───
export interface RollbackResult {
  /** 回滚是否成功 */
  success: boolean;
  /** 回滚的任务列表 */
  rolled_back_tasks: RolledBackTask[];
  /** 错误信息（如果部分失败） */
  errors: RollbackError[];
  /** 回滚时间 */
  executed_at: string;
}

export interface RolledBackTask {
  task_id: string;
  agent_id: string;
  from_version: number;
  to_version: number;
}

export interface RollbackError {
  task_id: string;
  error: string;
}

// ─── 回滚服务 ───
export class RollbackService {
  constructor(
    private readonly pg: Pool,
    private readonly neo4j: Neo4jSession,
  ) {}

  /**
   * 单龙虾回滚：将指定任务回滚到目标版本
   * 本质是移动 state_unit_pointers 指针
   */
  async rollbackSingleAgent(req: SingleAgentRollbackRequest): Promise<RollbackResult> {
    const errors: RollbackError[] = [];
    const rolledBack: RolledBackTask[] = [];

    try {
      // 验证目标版本存在
      const versionCheck = await this.pg.query(
        `SELECT version, agent_id FROM state_unit_history
         WHERE task_id = $1 AND version = $2`,
        [req.task_id, req.target_version],
      );

      if (versionCheck.rows.length === 0) {
        return {
          success: false,
          rolled_back_tasks: [],
          errors: [{ task_id: req.task_id, error: `Version ${req.target_version} not found` }],
          executed_at: new Date().toISOString(),
        };
      }

      // 获取当前版本
      const currentPointer = await this.pg.query(
        `SELECT current_version FROM state_unit_pointers WHERE task_id = $1`,
        [req.task_id],
      );
      const currentVersion = currentPointer.rows[0]?.current_version ?? 0;

      if (currentVersion === req.target_version) {
        return {
          success: true,
          rolled_back_tasks: [],
          errors: [],
          executed_at: new Date().toISOString(),
        };
      }

      // 移动指针到目标版本
      await this.pg.query(
        `INSERT INTO state_unit_pointers (task_id, current_version, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (task_id) DO UPDATE SET current_version = $2, updated_at = NOW()`,
        [req.task_id, req.target_version],
      );

      // 更新 Neo4j 中的任务状态
      const targetState = versionCheck.rows[0];
      await this.neo4j.run(
        `MATCH (t:Task {id: $task_id})
         SET t.state = $state, t.updated_at = datetime()`,
        { task_id: req.task_id, state: targetState.state },
      );

      // 记录审计日志
      await this.pg.query(
        `INSERT INTO audit_logs (actor_type, actor_id, action, resource_type, resource_id, details)
         VALUES ('user', $1, 'rollback', 'task', $2, $3)`,
        [
          req.initiated_by,
          req.task_id,
          JSON.stringify({
            agent_id: req.agent_id,
            from_version: currentVersion,
            to_version: req.target_version,
            reason: req.reason,
          }),
        ],
      );

      rolledBack.push({
        task_id: req.task_id,
        agent_id: req.agent_id,
        from_version: currentVersion,
        to_version: req.target_version,
      });
    } catch (err) {
      errors.push({
        task_id: req.task_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      success: errors.length === 0,
      rolled_back_tasks: rolledBack,
      errors,
      executed_at: new Date().toISOString(),
    };
  }

  /**
   * 团队整体回滚
   * 找到目标时间点前的所有任务最新版本，统一移动指针
   */
  async rollbackTeam(req: TeamRollbackRequest): Promise<RollbackResult> {
    const errors: RollbackError[] = [];
    const rolledBack: RolledBackTask[] = [];

    // 找到团队在目标时间点之前的所有任务及其最新版本
    let taskQuery = `
      SELECT h.task_id, h.agent_id, MAX(h.version) AS target_version
      FROM state_unit_history h
      JOIN agents a ON a.id = h.agent_id
      WHERE a.team_id = $1
      AND h.created_at <= $2
    `;
    const params: unknown[] = [req.team_id, req.target_timestamp];

    if (req.goal_id) {
      // 通过 Neo4j 查找目标下的所有任务
      const goalTasks = await this.neo4j.run(
        `MATCH (t:Task)-[:BELONGS_TO|RELATES_TO]->(:Goal {id: $goal_id})
         RETURN t.id AS task_id`,
        { goal_id: req.goal_id },
      );
      const taskIds = goalTasks.records.map((r) => r.get('task_id') as string);

      if (taskIds.length === 0) {
        return {
          success: true,
          rolled_back_tasks: [],
          errors: [],
          executed_at: new Date().toISOString(),
        };
      }

      taskQuery += ` AND h.task_id = ANY($3)`;
      params.push(taskIds);
    }

    taskQuery += ` GROUP BY h.task_id, h.agent_id`;

    const tasksResult = await this.pg.query(taskQuery, params);

    // 获取每个任务当前版本
    for (const row of tasksResult.rows) {
      const taskId = row.task_id as string;
      const agentId = row.agent_id as string;
      const targetVersion = row.target_version as number;

      try {
        const currentPointer = await this.pg.query(
          `SELECT current_version FROM state_unit_pointers WHERE task_id = $1`,
          [taskId],
        );
        const currentVersion = currentPointer.rows[0]?.current_version ?? 0;

        if (currentVersion === targetVersion) continue;

        // 移动指针
        await this.pg.query(
          `INSERT INTO state_unit_pointers (task_id, current_version, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (task_id) DO UPDATE SET current_version = $2, updated_at = NOW()`,
          [taskId, targetVersion],
        );

        // 获取目标版本的状态，同步 Neo4j
        const stateResult = await this.pg.query(
          `SELECT state FROM state_unit_history WHERE task_id = $1 AND version = $2`,
          [taskId, targetVersion],
        );
        if (stateResult.rows.length > 0) {
          await this.neo4j.run(
            `MATCH (t:Task {id: $task_id}) SET t.state = $state, t.updated_at = datetime()`,
            { task_id: taskId, state: stateResult.rows[0].state },
          );
        }

        rolledBack.push({
          task_id: taskId,
          agent_id: agentId,
          from_version: currentVersion,
          to_version: targetVersion,
        });
      } catch (err) {
        errors.push({
          task_id: taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 记录审计日志
    await this.pg.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, resource_type, resource_id, details)
       VALUES ('user', $1, 'team_rollback', 'team', $2, $3)`,
      [
        req.initiated_by,
        req.team_id,
        JSON.stringify({
          target_timestamp: req.target_timestamp,
          reason: req.reason,
          goal_id: req.goal_id,
          tasks_rolled_back: rolledBack.length,
          errors_count: errors.length,
        }),
      ],
    );

    return {
      success: errors.length === 0,
      rolled_back_tasks: rolledBack,
      errors,
      executed_at: new Date().toISOString(),
    };
  }

  /** 获取任务可回滚的版本列表 */
  async getAvailableVersions(taskId: string): Promise<{ version: number; state: string; created_at: string }[]> {
    const result = await this.pg.query(
      `SELECT version, state, created_at FROM state_unit_history
       WHERE task_id = $1 ORDER BY version DESC`,
      [taskId],
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      version: row.version as number,
      state: row.state as string,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string),
    }));
  }
}
