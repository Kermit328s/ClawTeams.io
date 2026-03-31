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

  getCoreFiles(agentId?: string): unknown[] {
    if (agentId) {
      const stmt = this.db.prepare('SELECT * FROM core_files WHERE agent_id = ?');
      return stmt.all(agentId);
    }
    const stmt = this.db.prepare('SELECT * FROM core_files');
    return stmt.all();
  }
}
