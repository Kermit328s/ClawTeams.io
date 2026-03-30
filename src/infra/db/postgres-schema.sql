-- ============================================================
-- ClawTeams PostgreSQL Schema
-- 账号、会话、权限、API Key
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 人类用户账号 ───
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    display_name    VARCHAR(128) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_active ON users (is_active) WHERE is_active = TRUE;

-- ─── 团队 ───
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_owner ON teams (owner_id);

-- ─── 团队成员关系 ───
CREATE TABLE team_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
);

CREATE INDEX idx_team_members_team ON team_members (team_id);
CREATE INDEX idx_team_members_user ON team_members (user_id);

-- ─── 龙虾账号 ───
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(128) NOT NULL,
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('online', 'offline', 'busy')),
    -- API Key: 只存储哈希值和前缀（用于识别）
    api_key_hash    VARCHAR(255) NOT NULL,
    api_key_prefix  VARCHAR(12) NOT NULL,
    -- 能力声明（JSON 格式）
    capabilities    JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ
);

CREATE INDEX idx_agents_team ON agents (team_id);
CREATE INDEX idx_agents_status ON agents (status);
CREATE INDEX idx_agents_api_key_prefix ON agents (api_key_prefix);
CREATE INDEX idx_agents_active ON agents (is_active) WHERE is_active = TRUE;

-- ─── 龙虾会话 ───
CREATE TABLE agent_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_status VARCHAR(20) NOT NULL DEFAULT 'idle'
                    CHECK (heartbeat_status IN ('idle', 'busy', 'overloaded', 'shutting_down')),
    current_task_id UUID,
    ip_address      INET,
    user_agent      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_agent_sessions_agent ON agent_sessions (agent_id);
CREATE INDEX idx_agent_sessions_active ON agent_sessions (is_active) WHERE is_active = TRUE;

-- ─── 人类用户会话（JWT refresh token 追踪） ───
CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_user_sessions_user ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_active ON user_sessions (is_active) WHERE is_active = TRUE;

-- ─── 角色 ───
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(64) NOT NULL,
    description     TEXT,
    team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,
    is_builtin      BOOLEAN NOT NULL DEFAULT FALSE,
    permissions     JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, team_id)
);

CREATE INDEX idx_roles_team ON roles (team_id);
CREATE INDEX idx_roles_builtin ON roles (is_builtin) WHERE is_builtin = TRUE;

-- ─── 权限绑定（主体 + 角色 + 范围） ───
CREATE TABLE permission_bindings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_type    VARCHAR(10) NOT NULL CHECK (subject_type IN ('user', 'agent')),
    subject_id      UUID NOT NULL,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    scope_team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    is_override     BOOLEAN NOT NULL DEFAULT FALSE,
    granted_by      UUID NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    UNIQUE (subject_type, subject_id, role_id, scope_team_id)
);

CREATE INDEX idx_perm_bindings_subject ON permission_bindings (subject_type, subject_id);
CREATE INDEX idx_perm_bindings_role ON permission_bindings (role_id);
CREATE INDEX idx_perm_bindings_scope ON permission_bindings (scope_team_id);

-- ─── API Key 管理（用于外部集成） ───
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(128) NOT NULL,
    key_hash        VARCHAR(255) NOT NULL,
    key_prefix      VARCHAR(12) NOT NULL,
    -- 归属：可以属于用户或团队
    owner_type      VARCHAR(10) NOT NULL CHECK (owner_type IN ('user', 'team')),
    owner_id        UUID NOT NULL,
    -- 权限范围
    scopes          JSONB NOT NULL DEFAULT '["read"]'::jsonb,
    -- 速率限制
    rate_limit_rpm  INTEGER NOT NULL DEFAULT 60,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX idx_api_keys_owner ON api_keys (owner_type, owner_id);
CREATE INDEX idx_api_keys_active ON api_keys (is_active) WHERE is_active = TRUE;

-- ─── 审计日志 ───
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type      VARCHAR(10) NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
    actor_id        UUID,
    action          VARCHAR(64) NOT NULL,
    resource_type   VARCHAR(32) NOT NULL,
    resource_id     UUID,
    details         JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_type, actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

-- ─── 状态单元版本历史（持久化存储） ───
CREATE TABLE state_unit_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id         UUID NOT NULL,
    agent_id        UUID NOT NULL,
    version         INTEGER NOT NULL,
    state           VARCHAR(20) NOT NULL
                    CHECK (state IN ('completed', 'failed', 'blocked', 'human_required')),
    result          JSONB NOT NULL,
    artifact_ids    UUID[] NOT NULL DEFAULT '{}',
    cognitive_signal JSONB,
    context_snapshot JSONB,
    upstream_task_ids  UUID[] NOT NULL DEFAULT '{}',
    downstream_task_ids UUID[] NOT NULL DEFAULT '{}',
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, version)
);

CREATE INDEX idx_state_units_task ON state_unit_history (task_id);
CREATE INDEX idx_state_units_task_version ON state_unit_history (task_id, version DESC);
CREATE INDEX idx_state_units_agent ON state_unit_history (agent_id);

-- ─── 状态单元当前指针（支持回滚=移动指针） ───
CREATE TABLE state_unit_pointers (
    task_id         UUID PRIMARY KEY,
    current_version INTEGER NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 内置角色初始化 ───
INSERT INTO roles (id, name, description, is_builtin, permissions) VALUES
    (uuid_generate_v4(), 'team_owner', '团队所有者，拥有所有权限', TRUE,
     '[{"resource_type":"*","resource_id":"*","actions":["create","read","update","delete","execute","assign","admin"]}]'::jsonb),
    (uuid_generate_v4(), 'team_admin', '团队管理员', TRUE,
     '[{"resource_type":"*","resource_id":"*","actions":["create","read","update","delete","execute","assign"]}]'::jsonb),
    (uuid_generate_v4(), 'team_member', '团队成员（人类）', TRUE,
     '[{"resource_type":"*","resource_id":"*","actions":["create","read","update"]}]'::jsonb),
    (uuid_generate_v4(), 'agent_worker', '普通龙虾，只能执行分配的任务', TRUE,
     '[{"resource_type":"task","resource_id":"*","actions":["read","execute"]},{"resource_type":"artifact","resource_id":"*","actions":["create","read"]}]'::jsonb),
    (uuid_generate_v4(), 'agent_lead', '高级龙虾，可自主分配子任务', TRUE,
     '[{"resource_type":"task","resource_id":"*","actions":["create","read","execute","assign"]},{"resource_type":"artifact","resource_id":"*","actions":["create","read","update"]}]'::jsonb),
    (uuid_generate_v4(), 'viewer', '只读观察者', TRUE,
     '[{"resource_type":"*","resource_id":"*","actions":["read"]}]'::jsonb)
ON CONFLICT DO NOTHING;

-- ─── 更新时间触发器 ───
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
