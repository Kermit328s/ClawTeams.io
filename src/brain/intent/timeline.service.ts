/**
 * 状态时间线服务
 * 记录：谁做了什么（actions log）、当前进度（progress states）、变化差异（diff log）
 */

import type { Pool } from 'pg';
import type { Session as Neo4jSession } from 'neo4j-driver';
import type { StateUnit } from '../../infra/shared';

// ─── 时间线条目 ───
export interface TimelineEntry {
  id: string;
  task_id: string;
  agent_id: string;
  version: number;
  state: string;
  result: Record<string, unknown>;
  artifact_ids: string[];
  cognitive_signal: Record<string, unknown> | null;
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
}

// ─── 差异日志 ───
export interface DiffLogEntry {
  task_id: string;
  from_version: number;
  to_version: number;
  changes: Record<string, { old: unknown; new: unknown }>;
  changed_at: string;
}

// ─── 时间线服务 ───
export class TimelineService {
  constructor(
    private readonly pg: Pool,
    private readonly neo4j: Neo4jSession,
  ) {}

  /** 写入状态单元（自动版本化） */
  async recordStateUnit(unit: StateUnit): Promise<TimelineEntry> {
    // 获取当前最高版本
    const versionResult = await this.pg.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version FROM state_unit_history WHERE task_id = $1`,
      [unit.task_id],
    );
    const nextVersion = (versionResult.rows[0].max_version as number) + 1;

    // 插入历史记录
    const result = await this.pg.query(
      `INSERT INTO state_unit_history
       (task_id, agent_id, version, state, result, artifact_ids, cognitive_signal, context_snapshot, upstream_task_ids, downstream_task_ids, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, task_id, agent_id, version, state, result, artifact_ids, cognitive_signal, context_snapshot, created_at`,
      [
        unit.task_id,
        unit.agent_id,
        nextVersion,
        unit.state,
        JSON.stringify(unit.result),
        unit.artifact_ids,
        unit.cognitive_signal ? JSON.stringify(unit.cognitive_signal) : null,
        unit.context_snapshot ? JSON.stringify(unit.context_snapshot) : null,
        unit.upstream_task_ids,
        unit.downstream_task_ids,
        unit.metadata ? JSON.stringify(unit.metadata) : null,
      ],
    );

    // 更新指针到最新版本
    await this.pg.query(
      `INSERT INTO state_unit_pointers (task_id, current_version, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (task_id) DO UPDATE SET current_version = $2, updated_at = NOW()`,
      [unit.task_id, nextVersion],
    );

    return this.mapTimelineEntry(result.rows[0]);
  }

  /** 获取任务的完整时间线 */
  async getTimeline(taskId: string): Promise<TimelineEntry[]> {
    const result = await this.pg.query(
      `SELECT id, task_id, agent_id, version, state, result, artifact_ids, cognitive_signal, context_snapshot, created_at
       FROM state_unit_history
       WHERE task_id = $1
       ORDER BY version ASC`,
      [taskId],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapTimelineEntry(row));
  }

  /** 获取任务当前状态（指针指向的版本） */
  async getCurrentState(taskId: string): Promise<TimelineEntry | null> {
    const result = await this.pg.query(
      `SELECT h.id, h.task_id, h.agent_id, h.version, h.state, h.result,
              h.artifact_ids, h.cognitive_signal, h.context_snapshot, h.created_at
       FROM state_unit_history h
       JOIN state_unit_pointers p ON p.task_id = h.task_id AND p.current_version = h.version
       WHERE h.task_id = $1`,
      [taskId],
    );
    return result.rows.length > 0 ? this.mapTimelineEntry(result.rows[0]) : null;
  }

  /** 计算两个版本之间的差异 */
  async getDiff(taskId: string, fromVersion: number, toVersion: number): Promise<DiffLogEntry | null> {
    const result = await this.pg.query(
      `SELECT version, state, result, artifact_ids FROM state_unit_history
       WHERE task_id = $1 AND version IN ($2, $3)
       ORDER BY version ASC`,
      [taskId, fromVersion, toVersion],
    );

    if (result.rows.length < 2) return null;

    const oldState = result.rows[0];
    const newState = result.rows[1];

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (oldState.state !== newState.state) {
      changes['state'] = { old: oldState.state, new: newState.state };
    }

    const oldResult = typeof oldState.result === 'string' ? JSON.parse(oldState.result) : oldState.result;
    const newResult = typeof newState.result === 'string' ? JSON.parse(newState.result) : newState.result;
    if (JSON.stringify(oldResult) !== JSON.stringify(newResult)) {
      changes['result'] = { old: oldResult, new: newResult };
    }

    const oldArtifacts = oldState.artifact_ids ?? [];
    const newArtifacts = newState.artifact_ids ?? [];
    if (JSON.stringify(oldArtifacts) !== JSON.stringify(newArtifacts)) {
      changes['artifact_ids'] = { old: oldArtifacts, new: newArtifacts };
    }

    return {
      task_id: taskId,
      from_version: fromVersion,
      to_version: toVersion,
      changes,
      changed_at: new Date().toISOString(),
    };
  }

  /** 获取龙虾的操作日志（actions log） */
  async getAgentActions(agentId: string, limit: number = 50): Promise<TimelineEntry[]> {
    const result = await this.pg.query(
      `SELECT id, task_id, agent_id, version, state, result, artifact_ids, cognitive_signal, context_snapshot, created_at
       FROM state_unit_history
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapTimelineEntry(row));
  }

  private mapTimelineEntry(row: Record<string, unknown>): TimelineEntry {
    return {
      id: row.id as string,
      task_id: row.task_id as string,
      agent_id: row.agent_id as string,
      version: row.version as number,
      state: row.state as string,
      result: typeof row.result === 'string' ? JSON.parse(row.result as string) : (row.result as Record<string, unknown>),
      artifact_ids: (row.artifact_ids as string[]) ?? [],
      cognitive_signal: row.cognitive_signal
        ? (typeof row.cognitive_signal === 'string' ? JSON.parse(row.cognitive_signal as string) : row.cognitive_signal as Record<string, unknown>)
        : null,
      context_snapshot: row.context_snapshot
        ? (typeof row.context_snapshot === 'string' ? JSON.parse(row.context_snapshot as string) : row.context_snapshot as Record<string, unknown>)
        : null,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string),
    };
  }
}
