-- ClawTeams 文件追踪服务 — SQLite Schema
-- 所有时间字段使用 ISO 8601 字符串

-- 龙虾注册
CREATE TABLE IF NOT EXISTS claws (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  claw_id       TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  openclaw_dir  TEXT NOT NULL,
  owner_id      TEXT,
  workspace_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online', 'offline')),
  gateway_port  INTEGER,
  config_hash   TEXT,
  last_heartbeat TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent 注册
CREATE TABLE IF NOT EXISTS agents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        TEXT NOT NULL,
  claw_id         TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  emoji           TEXT DEFAULT '',
  theme           TEXT DEFAULT '',
  model           TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'failed')),
  workspace_path  TEXT,
  capabilities    TEXT DEFAULT '[]',  -- JSON array
  current_task    TEXT,
  last_active_at  TEXT,
  registered_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, claw_id)
);

-- 核心文件当前状态
CREATE TABLE IF NOT EXISTS core_files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        TEXT,               -- null = 全局文件
  claw_id         TEXT NOT NULL DEFAULT '',
  file_type       TEXT,               -- soul | identity | agents | tools | user | heartbeat
  file_path       TEXT NOT NULL UNIQUE,
  current_hash    TEXT NOT NULL,
  current_content TEXT,
  version_count   INTEGER NOT NULL DEFAULT 1,
  last_changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 文件版本历史
CREATE TABLE IF NOT EXISTS file_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path       TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  hash            TEXT NOT NULL,
  content         TEXT,
  diff_from_prev  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 文件扫描状态
CREATE TABLE IF NOT EXISTS file_scan_state (
  file_path       TEXT PRIMARY KEY,
  last_hash       TEXT,
  last_scan_at    TEXT NOT NULL DEFAULT (datetime('now')),
  jsonl_last_line INTEGER DEFAULT 0
);

-- 任务执行记录（从会话文件解析）
CREATE TABLE IF NOT EXISTS executions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id          TEXT,
  agent_id              TEXT NOT NULL,
  claw_id               TEXT NOT NULL DEFAULT '',
  session_id            TEXT,
  trigger               TEXT DEFAULT 'unknown' CHECK(trigger IN ('user', 'cron', 'heartbeat', 'subagent', 'unknown')),
  status                TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'timeout')),
  input_preview         TEXT,
  output_preview        TEXT,
  error_message         TEXT,
  token_input           INTEGER,
  token_output          INTEGER,
  token_total           INTEGER,
  tool_calls            TEXT DEFAULT '[]',  -- JSON array
  artifact_ids          TEXT DEFAULT '[]',  -- JSON array
  parent_execution_id   INTEGER,
  started_at            TEXT,
  completed_at          TEXT,
  duration_ms           INTEGER,
  source                TEXT DEFAULT 'session_file' CHECK(source IN ('hook', 'session_file'))
);

-- 产出档案
CREATE TABLE IF NOT EXISTS artifacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id   TEXT UNIQUE,
  execution_id  INTEGER,
  agent_id      TEXT,
  claw_id       TEXT NOT NULL DEFAULT '',
  workspace_id  TEXT,
  type          TEXT DEFAULT 'document' CHECK(type IN ('document', 'code', 'data', 'media', 'config')),
  file_path     TEXT,
  file_hash     TEXT,
  file_size     INTEGER,
  version       INTEGER DEFAULT 1,
  tags          TEXT DEFAULT '[]',  -- JSON array
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent 间关系
CREATE TABLE IF NOT EXISTS agent_relations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  source_agent_id   TEXT NOT NULL,
  target_agent_id   TEXT NOT NULL,
  relation_type     TEXT NOT NULL DEFAULT 'collaboration' CHECK(relation_type IN ('collaboration', 'subagent', 'data_flow')),
  source_info       TEXT,
  strength          INTEGER DEFAULT 1,
  first_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_agent_id, target_agent_id, relation_type)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_agents_claw_id ON agents(claw_id);
CREATE INDEX IF NOT EXISTS idx_core_files_agent_id ON core_files(agent_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_file_path ON file_versions(file_path);
CREATE INDEX IF NOT EXISTS idx_executions_agent_id ON executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_session_id ON executions(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_agent_id ON artifacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_relations_source ON agent_relations(source_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_relations_target ON agent_relations(target_agent_id);
