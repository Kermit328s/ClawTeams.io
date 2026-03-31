import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { TaskEvent } from '../tracker/types';

/**
 * SQLite 数据库封装 — 使用 better-sqlite3
 */
export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    // 确保目录存在
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  /**
   * 初始化数据库 schema
   */
  private initSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }

  // ============================================================
  // Claw 操作
  // ============================================================

  upsertClaw(claw: {
    claw_id: string;
    name: string;
    openclaw_dir: string;
    gateway_port?: number;
    config_hash?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO claws (claw_id, name, openclaw_dir, gateway_port, config_hash)
      VALUES (@claw_id, @name, @openclaw_dir, @gateway_port, @config_hash)
      ON CONFLICT(claw_id) DO UPDATE SET
        name = excluded.name,
        openclaw_dir = excluded.openclaw_dir,
        gateway_port = excluded.gateway_port,
        config_hash = excluded.config_hash
    `);
    stmt.run({
      claw_id: claw.claw_id,
      name: claw.name,
      openclaw_dir: claw.openclaw_dir,
      gateway_port: claw.gateway_port ?? null,
      config_hash: claw.config_hash ?? null,
    });
  }

  // ============================================================
  // Agent 操作
  // ============================================================

  upsertAgent(agent: {
    agent_id: string;
    claw_id: string;
    name: string;
    emoji?: string;
    theme?: string;
    model?: string;
    workspace_path?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO agents (agent_id, claw_id, name, emoji, theme, model, workspace_path)
      VALUES (@agent_id, @claw_id, @name, @emoji, @theme, @model, @workspace_path)
      ON CONFLICT(agent_id, claw_id) DO UPDATE SET
        name = excluded.name,
        emoji = excluded.emoji,
        theme = excluded.theme,
        model = excluded.model,
        workspace_path = excluded.workspace_path
    `);
    stmt.run({
      agent_id: agent.agent_id,
      claw_id: agent.claw_id,
      name: agent.name,
      emoji: agent.emoji ?? '',
      theme: agent.theme ?? '',
      model: agent.model ?? '',
      workspace_path: agent.workspace_path ?? '',
    });
  }

  // ============================================================
  // CoreFile 操作
  // ============================================================

  upsertCoreFile(file: {
    claw_id: string;
    agent_id: string | null;
    file_type: string | null;
    file_path: string;
    current_hash: string;
    current_content: string | null;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO core_files (claw_id, agent_id, file_type, file_path, current_hash, current_content, version_count, last_changed_at)
      VALUES (@claw_id, @agent_id, @file_type, @file_path, @current_hash, @current_content, 1, datetime('now'))
      ON CONFLICT(file_path) DO UPDATE SET
        current_hash = excluded.current_hash,
        current_content = excluded.current_content,
        version_count = core_files.version_count + 1,
        last_changed_at = datetime('now')
    `);
    stmt.run(file);
  }

  getLatestFileContent(filePath: string): string | null {
    const stmt = this.db.prepare('SELECT current_content FROM core_files WHERE file_path = ?');
    const row = stmt.get(filePath) as { current_content: string | null } | undefined;
    return row?.current_content ?? null;
  }

  // ============================================================
  // FileVersion 操作
  // ============================================================

  insertFileVersion(version: {
    file_path: string;
    hash: string;
    content: string | null;
    diff_from_prev: string | null;
  }): void {
    // 获取下一个版本号
    const countStmt = this.db.prepare(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM file_versions WHERE file_path = ?'
    );
    const row = countStmt.get(version.file_path) as { next_version: number };

    const stmt = this.db.prepare(`
      INSERT INTO file_versions (file_path, version, hash, content, diff_from_prev)
      VALUES (@file_path, @version, @hash, @content, @diff_from_prev)
    `);
    stmt.run({
      ...version,
      version: row.next_version,
    });
  }

  // ============================================================
  // 扫描状态操作
  // ============================================================

  upsertScanState(state: {
    file_path: string;
    last_hash: string;
    last_scan_at: string;
    jsonl_last_line: number | null;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_scan_state (file_path, last_hash, last_scan_at, jsonl_last_line)
      VALUES (@file_path, @last_hash, @last_scan_at, @jsonl_last_line)
      ON CONFLICT(file_path) DO UPDATE SET
        last_hash = excluded.last_hash,
        last_scan_at = excluded.last_scan_at,
        jsonl_last_line = excluded.jsonl_last_line
    `);
    stmt.run(state);
  }

  getAllScanStates(): {
    file_path: string;
    last_hash: string;
    last_scan_at: string;
    jsonl_last_line: number | null;
  }[] {
    const stmt = this.db.prepare('SELECT * FROM file_scan_state');
    return stmt.all() as {
      file_path: string;
      last_hash: string;
      last_scan_at: string;
      jsonl_last_line: number | null;
    }[];
  }

  // ============================================================
  // Execution 操作
  // ============================================================

  insertExecution(task: TaskEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO executions (
        agent_id, session_id, trigger, status,
        input_preview, output_preview,
        token_input, token_output, token_total,
        tool_calls, started_at, completed_at, duration_ms, source
      ) VALUES (
        @agent_id, @session_id, @trigger, @status,
        @input_preview, @output_preview,
        @token_input, @token_output, @token_total,
        @tool_calls, @started_at, @completed_at, @duration_ms, 'session_file'
      )
    `);
    stmt.run({
      agent_id: task.agent_id,
      session_id: task.session_id,
      trigger: task.trigger,
      status: task.status,
      input_preview: task.input_preview,
      output_preview: task.output_preview,
      token_input: task.token_input ?? null,
      token_output: task.token_output ?? null,
      token_total: task.token_total ?? null,
      tool_calls: JSON.stringify(task.tool_calls),
      started_at: task.started_at.toISOString(),
      completed_at: task.completed_at?.toISOString() ?? null,
      duration_ms: task.duration_ms ?? null,
    });
  }

  // ============================================================
  // Agent Relations 操作
  // ============================================================

  upsertAgentRelation(relation: {
    source_agent_id: string;
    target_agent_id: string;
    relation_type: 'collaboration' | 'subagent' | 'data_flow';
    source_info?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_relations (source_agent_id, target_agent_id, relation_type, source_info)
      VALUES (@source_agent_id, @target_agent_id, @relation_type, @source_info)
      ON CONFLICT(source_agent_id, target_agent_id, relation_type) DO UPDATE SET
        strength = agent_relations.strength + 1,
        last_seen_at = datetime('now'),
        source_info = COALESCE(excluded.source_info, agent_relations.source_info)
    `);
    stmt.run({
      source_agent_id: relation.source_agent_id,
      target_agent_id: relation.target_agent_id,
      relation_type: relation.relation_type,
      source_info: relation.source_info ?? null,
    });
  }

  // ============================================================
  // 查询方法
  // ============================================================

  getAgents(clawId: string): unknown[] {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE claw_id = ?');
    return stmt.all(clawId);
  }

  getExecutions(agentId: string, limit = 50): unknown[] {
    const stmt = this.db.prepare(
      'SELECT * FROM executions WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?'
    );
    return stmt.all(agentId, limit);
  }

  getFileVersions(filePath: string, limit = 20): unknown[] {
    const stmt = this.db.prepare(
      'SELECT * FROM file_versions WHERE file_path = ? ORDER BY version DESC LIMIT ?'
    );
    return stmt.all(filePath, limit);
  }

  // ============================================================
  // Claw 状态更新（Hook 事件用）
  // ============================================================

  updateClawStatus(clawId: string, status: 'online' | 'offline'): void {
    const stmt = this.db.prepare(`
      UPDATE claws SET status = @status, last_heartbeat = datetime('now')
      WHERE claw_id = @claw_id
    `);
    stmt.run({ claw_id: clawId, status });
  }

  // ============================================================
  // Agent 状态更新（Hook 事件用）
  // ============================================================

  updateAgentStatus(clawId: string, agentId: string, status: 'idle' | 'running' | 'failed'): void {
    const stmt = this.db.prepare(`
      UPDATE agents SET status = @status, last_active_at = datetime('now')
      WHERE agent_id = @agent_id AND claw_id = @claw_id
    `);
    stmt.run({ agent_id: agentId, claw_id: clawId, status });
  }

  // ============================================================
  // Execution 操作（Hook 事件用）
  // ============================================================

  /**
   * 根据 run_id 查找已有执行记录（用于去重）
   */
  getExecutionByRunId(runId: string): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM executions WHERE execution_id = ?');
    return stmt.get(runId);
  }

  /**
   * 从 Hook 事件写入执行记录
   */
  insertExecutionFromHook(data: {
    agent_id: string;
    claw_id: string;
    run_id: string;
    status: 'completed' | 'failed';
    duration_ms?: number;
    token_input?: number;
    token_output?: number;
    token_total?: number;
    has_tool_calls: boolean;
    timestamp: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO executions (
        execution_id, agent_id, claw_id, status,
        token_input, token_output, token_total,
        tool_calls, started_at, completed_at, duration_ms, source
      ) VALUES (
        @execution_id, @agent_id, @claw_id, @status,
        @token_input, @token_output, @token_total,
        @tool_calls, @started_at, @completed_at, @duration_ms, 'hook'
      )
    `);

    const completedAt = new Date(data.timestamp).toISOString();
    const startedAt = data.duration_ms
      ? new Date(data.timestamp - data.duration_ms).toISOString()
      : completedAt;

    stmt.run({
      execution_id: data.run_id,
      agent_id: data.agent_id,
      claw_id: data.claw_id,
      status: data.status,
      token_input: data.token_input ?? null,
      token_output: data.token_output ?? null,
      token_total: data.token_total ?? null,
      tool_calls: data.has_tool_calls ? '[]' : '[]',
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: data.duration_ms ?? null,
    });
  }

  getCoreFiles(agentId?: string): unknown[] {
    if (agentId) {
      const stmt = this.db.prepare('SELECT * FROM core_files WHERE agent_id = ?');
      return stmt.all(agentId);
    }
    const stmt = this.db.prepare('SELECT * FROM core_files');
    return stmt.all();
  }

  // ============================================================
  // Sprint 2: 扩展查询方法
  // ============================================================

  // ---- 用户 ----

  createUser(user: { email: string; password_hash: string; name: string }): { id: number } {
    const stmt = this.db.prepare(`
      INSERT INTO users (email, password_hash, name) VALUES (@email, @password_hash, @name)
    `);
    const result = stmt.run(user);
    return { id: Number(result.lastInsertRowid) };
  }

  getUserByEmail(email: string): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  getUserById(id: number): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  // ---- 工作空间 ----

  createWorkspace(ws: { name: string; owner_id: number }): { id: number } {
    const stmt = this.db.prepare(`
      INSERT INTO workspaces (name, owner_id) VALUES (@name, @owner_id)
    `);
    const result = stmt.run(ws);
    return { id: Number(result.lastInsertRowid) };
  }

  getWorkspaces(ownerId?: number): unknown[] {
    if (ownerId) {
      const stmt = this.db.prepare('SELECT * FROM workspaces WHERE owner_id = ?');
      return stmt.all(ownerId);
    }
    const stmt = this.db.prepare('SELECT * FROM workspaces');
    return stmt.all();
  }

  getWorkspaceById(id: number): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE id = ?');
    return stmt.get(id);
  }

  // ---- Claw 查询 ----

  getClawsByWorkspaceId(workspaceId: string): unknown[] {
    const stmt = this.db.prepare('SELECT * FROM claws WHERE workspace_id = ?');
    return stmt.all(workspaceId);
  }

  getAllClaws(): unknown[] {
    const stmt = this.db.prepare('SELECT * FROM claws');
    return stmt.all();
  }

  getClawById(clawId: string): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM claws WHERE claw_id = ?');
    return stmt.get(clawId);
  }

  // ---- Agent 查询扩展 ----

  getAgentsByClawId(clawId: string): unknown[] {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE claw_id = ?');
    return stmt.all(clawId);
  }

  getAgentProfile(agentId: string): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE agent_id = ?');
    return stmt.get(agentId);
  }

  getAgentProfileByPk(id: number): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    return stmt.get(id);
  }

  // ---- Core File 查询扩展 ----

  getCoreFilesByAgentId(agentId: string): unknown[] {
    const stmt = this.db.prepare('SELECT * FROM core_files WHERE agent_id = ?');
    return stmt.all(agentId);
  }

  getCoreFileContent(agentId: string, fileType: string): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM core_files WHERE agent_id = ? AND file_type = ?');
    return stmt.get(agentId, fileType);
  }

  getFileVersionsByPath(filePath: string, limit = 20): unknown[] {
    const stmt = this.db.prepare(
      'SELECT * FROM file_versions WHERE file_path = ? ORDER BY version DESC LIMIT ?'
    );
    return stmt.all(filePath, limit);
  }

  getFileVersionsByCoreFileId(coreFileId: number, limit = 20): unknown[] {
    // 先获取 core_file 的 file_path，再查 file_versions
    const cf = this.db.prepare('SELECT file_path FROM core_files WHERE id = ?').get(coreFileId) as { file_path: string } | undefined;
    if (!cf) return [];
    return this.getFileVersionsByPath(cf.file_path, limit);
  }

  // ---- Execution 查询扩展 ----

  getExecutionsFiltered(filters: {
    agent_id?: string;
    claw_id?: string;
    workspace_id?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): unknown[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.agent_id) { conditions.push('agent_id = ?'); params.push(filters.agent_id); }
    if (filters.claw_id) { conditions.push('claw_id = ?'); params.push(filters.claw_id); }
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (filters.date_from) { conditions.push('started_at >= ?'); params.push(filters.date_from); }
    if (filters.date_to) { conditions.push('started_at <= ?'); params.push(filters.date_to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const stmt = this.db.prepare(
      `SELECT * FROM executions ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`
    );
    return stmt.all(...params, limit, offset);
  }

  getExecutionById(id: number): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM executions WHERE id = ?');
    return stmt.get(id);
  }

  getExecutionStats(agentId: string, period: 'today' | 'week'): {
    total: number;
    succeeded: number;
    failed: number;
    total_tokens: number;
  } {
    let dateFilter: string;
    if (period === 'today') {
      dateFilter = "started_at >= date('now', 'start of day')";
    } else {
      dateFilter = "started_at >= date('now', '-7 days')";
    }

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as succeeded,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(token_total), 0) as total_tokens
      FROM executions
      WHERE agent_id = ? AND ${dateFilter}
    `);

    const row = stmt.get(agentId) as {
      total: number;
      succeeded: number;
      failed: number;
      total_tokens: number;
    };

    return {
      total: row.total ?? 0,
      succeeded: row.succeeded ?? 0,
      failed: row.failed ?? 0,
      total_tokens: row.total_tokens ?? 0,
    };
  }

  getRecentTokens(agentId: string, minutesAgo: number = 10): number {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(token_total), 0) as tokens
      FROM executions
      WHERE agent_id = ? AND started_at >= datetime('now', '-' || ? || ' minutes')
    `);
    const row = stmt.get(agentId, minutesAgo) as { tokens: number };
    return row.tokens ?? 0;
  }

  // ---- Artifact 查询 ----

  getArtifactsFiltered(filters: {
    agent_id?: string;
    claw_id?: string;
    workspace_id?: string;
    type?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): unknown[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.agent_id) { conditions.push('agent_id = ?'); params.push(filters.agent_id); }
    if (filters.claw_id) { conditions.push('claw_id = ?'); params.push(filters.claw_id); }
    if (filters.workspace_id) { conditions.push('workspace_id = ?'); params.push(filters.workspace_id); }
    if (filters.type) { conditions.push('type = ?'); params.push(filters.type); }
    if (filters.date_from) { conditions.push('created_at >= ?'); params.push(filters.date_from); }
    if (filters.date_to) { conditions.push('created_at <= ?'); params.push(filters.date_to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const stmt = this.db.prepare(
      `SELECT * FROM artifacts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    );
    return stmt.all(...params, limit, offset);
  }

  getArtifactById(id: number): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM artifacts WHERE id = ?');
    return stmt.get(id);
  }

  getArtifactByArtifactId(artifactId: string): unknown | undefined {
    const stmt = this.db.prepare('SELECT * FROM artifacts WHERE artifact_id = ?');
    return stmt.get(artifactId);
  }

  // ---- Agent Relations 查询 ----

  getAgentRelations(agentId: string): unknown[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_relations
      WHERE source_agent_id = ? OR target_agent_id = ?
      ORDER BY strength DESC
    `);
    return stmt.all(agentId, agentId);
  }

  // ---- Activity Log 查询 ----

  getActivityLog(filters: {
    workspace_id?: string;
    claw_id?: string;
    types?: string[];
    limit?: number;
    offset?: number;
  }): unknown[] {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    // 合并 executions 和 file_versions 和 artifacts 成活动流
    // 按时间排序返回
    const activities: unknown[] = [];

    // 执行记录作为活动
    {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filters.claw_id) { conditions.push('e.claw_id = ?'); params.push(filters.claw_id); }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const stmt = this.db.prepare(`
        SELECT
          'execution.' || CASE WHEN e.status = 'completed' THEN 'completed'
                               WHEN e.status = 'failed' THEN 'failed'
                               ELSE 'started' END as type,
          e.agent_id,
          a.emoji as agent_emoji,
          COALESCE(e.input_preview, '') as summary,
          COALESCE(e.completed_at, e.started_at) as timestamp
        FROM executions e
        LEFT JOIN agents a ON e.agent_id = a.agent_id AND e.claw_id = a.claw_id
        ${where}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);
      const rows = stmt.all(...params, limit, offset);
      activities.push(...(rows as unknown[]));
    }

    // 文件变更作为活动
    {
      const stmt = this.db.prepare(`
        SELECT
          'file.changed' as type,
          cf.agent_id,
          a.emoji as agent_emoji,
          cf.file_type,
          fv.version,
          fv.created_at as timestamp
        FROM file_versions fv
        JOIN core_files cf ON fv.file_path = cf.file_path
        LEFT JOIN agents a ON cf.agent_id = a.agent_id
        ORDER BY fv.created_at DESC
        LIMIT ? OFFSET ?
      `);
      const rows = stmt.all(limit, offset);
      activities.push(...(rows as unknown[]));
    }

    // 档案创建作为活动
    {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filters.workspace_id) { conditions.push('ar.workspace_id = ?'); params.push(filters.workspace_id); }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const stmt = this.db.prepare(`
        SELECT
          'artifact.created' as type,
          ar.agent_id,
          a.emoji as agent_emoji,
          COALESCE(ar.file_path, '') as artifact_name,
          ar.created_at as timestamp
        FROM artifacts ar
        LEFT JOIN agents a ON ar.agent_id = a.agent_id
        ${where}
        ORDER BY ar.created_at DESC
        LIMIT ? OFFSET ?
      `);
      const rows = stmt.all(...params, limit, offset);
      activities.push(...(rows as unknown[]));
    }

    // 合并排序
    (activities as { timestamp: string }[]).sort((a, b) => {
      return (b.timestamp ?? '').localeCompare(a.timestamp ?? '');
    });

    // 类型过滤
    let filtered = activities as { type: string }[];
    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter(a => filters.types!.some(t => a.type.startsWith(t)));
    }

    return filtered.slice(0, limit);
  }

  // ---- 工作流图辅助 ----

  getAllAgentsForWorkspace(workspaceId?: string): unknown[] {
    if (workspaceId) {
      const stmt = this.db.prepare(`
        SELECT a.* FROM agents a
        JOIN claws c ON a.claw_id = c.claw_id
        WHERE c.workspace_id = ?
      `);
      return stmt.all(workspaceId);
    }
    const stmt = this.db.prepare('SELECT * FROM agents');
    return stmt.all();
  }

  getAllRelationsForWorkspace(workspaceId?: string): unknown[] {
    if (workspaceId) {
      const stmt = this.db.prepare(`
        SELECT ar.* FROM agent_relations ar
        JOIN agents a ON ar.source_agent_id = a.agent_id
        JOIN claws c ON a.claw_id = c.claw_id
        WHERE c.workspace_id = ?
      `);
      return stmt.all(workspaceId);
    }
    const stmt = this.db.prepare('SELECT * FROM agent_relations');
    return stmt.all();
  }

  // ---- Raw 查询（用于直接 SQL） ----

  rawGet(sql: string, ...params: unknown[]): unknown | undefined {
    return this.db.prepare(sql).get(...params);
  }

  rawAll(sql: string, ...params: unknown[]): unknown[] {
    return this.db.prepare(sql).all(...params);
  }

  rawRun(sql: string, ...params: unknown[]): void {
    this.db.prepare(sql).run(...params);
  }
}
