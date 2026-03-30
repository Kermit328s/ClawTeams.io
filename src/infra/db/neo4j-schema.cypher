// ============================================================
// ClawTeams Neo4j 图数据库 Schema
// 节点和边类型定义 + 约束 + 索引
// ============================================================

// ─── 唯一性约束（节点） ───

CREATE CONSTRAINT goal_id_unique IF NOT EXISTS
FOR (g:Goal) REQUIRE g.id IS UNIQUE;

CREATE CONSTRAINT task_id_unique IF NOT EXISTS
FOR (t:Task) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT decision_id_unique IF NOT EXISTS
FOR (d:Decision) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT human_id_unique IF NOT EXISTS
FOR (h:Human) REQUIRE h.id IS UNIQUE;

CREATE CONSTRAINT cognition_id_unique IF NOT EXISTS
FOR (c:Cognition) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT agent_id_unique IF NOT EXISTS
FOR (a:Agent) REQUIRE a.id IS UNIQUE;

CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT team_id_unique IF NOT EXISTS
FOR (t:Team) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT role_id_unique IF NOT EXISTS
FOR (r:Role) REQUIRE r.id IS UNIQUE;

// ─── 存在性约束（必填字段） ───

CREATE CONSTRAINT goal_title_exists IF NOT EXISTS
FOR (g:Goal) REQUIRE g.title IS NOT NULL;

CREATE CONSTRAINT goal_status_exists IF NOT EXISTS
FOR (g:Goal) REQUIRE g.status IS NOT NULL;

CREATE CONSTRAINT goal_team_id_exists IF NOT EXISTS
FOR (g:Goal) REQUIRE g.team_id IS NOT NULL;

CREATE CONSTRAINT task_title_exists IF NOT EXISTS
FOR (t:Task) REQUIRE t.title IS NOT NULL;

CREATE CONSTRAINT task_state_exists IF NOT EXISTS
FOR (t:Task) REQUIRE t.state IS NOT NULL;

CREATE CONSTRAINT task_task_type_exists IF NOT EXISTS
FOR (t:Task) REQUIRE t.task_type IS NOT NULL;

CREATE CONSTRAINT agent_name_exists IF NOT EXISTS
FOR (a:Agent) REQUIRE a.name IS NOT NULL;

CREATE CONSTRAINT user_email_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.email IS UNIQUE;

CREATE CONSTRAINT team_name_exists IF NOT EXISTS
FOR (t:Team) REQUIRE t.name IS NOT NULL;

// ─── 索引（查询优化） ───

CREATE INDEX goal_status_idx IF NOT EXISTS
FOR (g:Goal) ON (g.status);

CREATE INDEX goal_team_idx IF NOT EXISTS
FOR (g:Goal) ON (g.team_id);

CREATE INDEX task_state_idx IF NOT EXISTS
FOR (t:Task) ON (t.state);

CREATE INDEX task_workflow_idx IF NOT EXISTS
FOR (t:Task) ON (t.workflow_id);

CREATE INDEX task_assigned_agent_idx IF NOT EXISTS
FOR (t:Task) ON (t.assigned_agent_id);

CREATE INDEX agent_team_idx IF NOT EXISTS
FOR (a:Agent) ON (a.team_id);

CREATE INDEX agent_status_idx IF NOT EXISTS
FOR (a:Agent) ON (a.status);

CREATE INDEX cognition_team_idx IF NOT EXISTS
FOR (c:Cognition) ON (c.team_id);

CREATE INDEX cognition_confidence_idx IF NOT EXISTS
FOR (c:Cognition) ON (c.confidence);

// ─── 全文索引（搜索） ───

CREATE FULLTEXT INDEX goal_fulltext IF NOT EXISTS
FOR (g:Goal) ON EACH [g.title, g.description];

CREATE FULLTEXT INDEX task_fulltext IF NOT EXISTS
FOR (t:Task) ON EACH [t.title, t.description];

CREATE FULLTEXT INDEX cognition_fulltext IF NOT EXISTS
FOR (c:Cognition) ON EACH [c.content];

// ============================================================
// 节点属性参考（非执行语句，仅文档化）
// ============================================================

// (:Goal {
//   id: STRING,            -- UUID
//   title: STRING,
//   description: STRING,
//   status: STRING,        -- 'active' | 'completed' | 'paused' | 'cancelled'
//   priority: STRING,      -- 'critical' | 'high' | 'medium' | 'low'
//   team_id: STRING,       -- UUID
//   deadline: DATETIME,
//   created_at: DATETIME,
//   updated_at: DATETIME
// })

// (:Task {
//   id: STRING,            -- UUID
//   title: STRING,
//   description: STRING,
//   task_type: STRING,
//   state: STRING,         -- 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'blocked' | 'human_required' | 'cancelled'
//   priority: STRING,
//   assigned_agent_id: STRING,
//   workflow_id: STRING,
//   deadline: DATETIME,
//   created_at: DATETIME,
//   updated_at: DATETIME
// })

// (:Decision {
//   id: STRING,
//   question: STRING,
//   options: STRING,       -- JSON 序列化
//   chosen_option: STRING,
//   decided_by: STRING,
//   decided_at: DATETIME,
//   created_at: DATETIME,
//   updated_at: DATETIME
// })

// (:Human {
//   id: STRING,
//   title: STRING,
//   description: STRING,
//   required_by_task_id: STRING,
//   assigned_user_id: STRING,
//   resolved: BOOLEAN,
//   resolution: STRING,
//   created_at: DATETIME,
//   updated_at: DATETIME
// })

// (:Cognition {
//   id: STRING,
//   content: STRING,
//   source_task_id: STRING,
//   confidence: FLOAT,     -- 0.0 ~ 1.0
//   tags: LIST<STRING>,
//   team_id: STRING,
//   verified: BOOLEAN,
//   verified_by: STRING,
//   reference_count: INTEGER,
//   created_at: DATETIME,
//   updated_at: DATETIME
// })

// (:Agent {
//   id: STRING,
//   name: STRING,
//   status: STRING,        -- 'online' | 'offline' | 'busy'
//   team_id: STRING,
//   capabilities: STRING,  -- JSON 序列化
//   created_at: DATETIME,
//   last_active_at: DATETIME
// })

// (:User {
//   id: STRING,
//   email: STRING,
//   display_name: STRING,
//   created_at: DATETIME
// })

// (:Team {
//   id: STRING,
//   name: STRING,
//   description: STRING,
//   created_at: DATETIME
// })

// (:Role {
//   id: STRING,
//   name: STRING,
//   description: STRING,
//   is_builtin: BOOLEAN,
//   team_id: STRING,
//   permissions: STRING    -- JSON 序列化
// })

// ============================================================
// 边类型参考
// ============================================================

// [:DEPENDS_ON]      -- 顺序依赖（A完成后才能做B）
//   属性: weight FLOAT

// [:PARALLEL_WITH]   -- 并行关系

// [:CONDITION]       -- 条件依赖
//   属性: condition_expr STRING

// [:AGGREGATES]      -- 聚合关系（A和B都完成才触发C）

// [:LOOP_BACK]       -- 回环关系（不合格回到上游重做）
//   属性: max_retries INTEGER, current_retries INTEGER

// [:BELONGS_TO]      -- 归属关系（Task BELONGS_TO Goal）

// [:OWNS]            -- 所有权关系（User OWNS Team）

// [:RESPONSIBLE_FOR] -- 负责关系（Agent RESPONSIBLE_FOR Task）

// [:RELATES_TO]      -- 认知关联
//   属性: relevance FLOAT

// [:EVOLVED_FROM]    -- 认知迭代
//   属性: reason STRING, evolution_type STRING
