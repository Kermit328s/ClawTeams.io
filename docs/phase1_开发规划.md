# 阶段一：看见 — 开发规划

> 目标：一个人连上龙虾后，能看到龙虾在做什么、做了什么、产出了什么
> 验证标准：接入一只龙虾，界面上看到 agent 状态、历史任务、产出档案

---

## 1. 交付物总览

```
用户接入龙虾
  → 龙虾通过 claw-sdk 连接 ClawTeams
  → ClawTeams 透视龙虾内部 agent 结构和工作行为
  → 自动生成工作流可视化图
  → agent 产出自动归档到资产档案库
  → 用户在前端看到一切
```

---

## 2. 功能拆解

### F1: 连接层 — 让龙虾能接入

**claw-sdk（龙虾端）**
- 龙虾通过 SDK 连接 ClawTeams 后端
- 注册握手：上报 claw_id、owner_id、内部 agent 列表和能力声明
- 心跳机制：保持连接活跃，检测断线
- 状态上报：agent 开始/完成/失败任务时主动通知
- 断线重连：指数退避自动重连

**后端 WebSocket 服务**
- 接受龙虾连接、验证身份
- 管理连接池（哪些龙虾在线、哪些 agent 活跃）
- 接收状态上报 → 写入数据库
- 推送事件给前端

**适配层（Output Hook）**
- 捕获 agent 上报的执行结果
- 转换为标准化的状态记录
- 写入 Brain 状态存储

### F2: Brain 基础版 — 记录龙虾状态

**龙虾注册表**
- 存储 claw_id、owner_id、agent 列表
- 每个 agent 的能力声明、当前状态、所属工作空间
- 龙虾在线/离线状态

**任务记录**
- agent 执行的每个任务：task_id、agent_id、开始时间、结束时间、状态、产出
- 按时间线查询：某个 agent 在过去 N 天做了什么
- 按龙虾查询：这只龙虾的所有 agent 的工作汇总

**状态时间线**
- 谁做了什么（actions log）
- 当前进度（各 agent 状态）
- 变化记录（状态转换历史）

### F3: 资产档案基础版 — 产出自动归档

**自动归档**
- agent 完成任务后，产出物自动存入档案库
- 记录：artifact_id、来源 agent、来源任务、类型、时间
- 支持文件上传到对象存储（R2/MinIO）

**档案浏览**
- 按时间线浏览所有产出
- 按龙虾/agent 筛选
- 按类型筛选（文档/代码/数据/媒体）
- 查看档案详情和版本历史

**节点间传递**（基础版）
- 一个 agent 的产出可以被标记为另一个 agent 的输入
- 通过 artifact_id 关联上下游

### F4: 工作流自动可视化 — 从行为中生成

**行为观察引擎**
- 监听 agent 的任务开始/完成事件
- 记录 agent 之间的数据传递关系（A 的产出被 B 消费）
- 识别任务链条：A 完成 → B 开始（时序依赖）

**自动生成工作流图**
- 从任务历史中提取节点（每个 agent 任务 = 一个节点）
- 从数据传递关系中提取边（A→B = 一条边）
- 生成可视化的 DAG

**工作流图是只读的**（阶段一不支持编辑）
- 用户只能看，不能改
- 图会随着 agent 新的任务自动更新
- 历史工作流可以回看

### F5: 前端 — 单人工作台

**主界面布局（简化版）**
```
┌─────────────────────────────────────────┐
│  顶部：工作空间名称 + 龙虾连接状态      │
├───────────────┬─────────────────────────┤
│               │                         │
│  左侧面板     │     右侧主区域           │
│  龙虾列表     │     工作流地图           │
│  └ Agent 列表 │     (自动生成，只读)      │
│  └ 状态指示   │                         │
│               │                         │
│  资产档案列表 │                         │
│  └ 最近产出   │                         │
│  └ 按类型筛选 │                         │
│               │                         │
├───────────────┴─────────────────────────┤
│  底部：活动日志（实时滚动）              │
└─────────────────────────────────────────┘
```

**龙虾面板**
- 显示已连接的龙虾列表
- 展开龙虾可看到内部 agent 列表
- 每个 agent 显示：名称、能力标签、当前状态（🔵执行中/⚪空闲/🔴失败）
- 点击 agent → 右侧地图高亮该 agent 相关的节点

**工作流地图**
- React Flow 渲染的自动生成工作流
- 节点 = agent 任务（灰/蓝/绿/红颜色表示状态）
- 边 = agent 之间的数据传递关系
- 实时更新：新任务出现时节点自动添加
- 点击节点 → 弹出任务详情（输入、输出、产出档案）

**资产档案面板**
- 最近产出列表
- 按类型/agent/时间筛选
- 点击档案 → 查看详情、下载、版本历史

**活动日志**
- 实时滚动的事件流
- agent 开始任务、完成任务、产出归档等事件
- 时间戳 + 简短描述

---

## 3. 技术架构

```
┌──────────────┐     WebSocket      ┌──────────────────┐
│  龙虾(OpenClaw)│ ←──────────────→ │  ClawTeams 后端    │
│  └ claw-sdk  │    注册/上报/心跳  │  ├ WebSocket 服务   │
└──────────────┘                    │  ├ 连接管理器       │
                                    │  ├ Output Hook      │
                                    │  ├ Brain 基础版     │
┌──────────────┐     WebSocket      │  ├ 档案服务        │
│  前端 (React) │ ←──────────────→ │  ├ 行为观察引擎     │
│  ├ 龙虾面板   │    事件推送       │  └ REST API        │
│  ├ 工作流地图 │                   └──────────────────┘
│  ├ 档案面板   │                          │
│  └ 活动日志   │                    ┌─────┴──────┐
└──────────────┘                    │ PostgreSQL  │  Neo4j
                                    │ (账号/任务  │  (工作流图
                                    │  /档案元数据)│   /agent关系)
                                    └─────┬──────┘
                                          │
                                    ┌─────┴──────┐
                                    │ R2 / MinIO  │
                                    │ (文件存储)   │
                                    └────────────┘
```

---

## 4. 数据模型（阶段一所需）

### PostgreSQL

```sql
-- 用户（简化版，单人场景）
users (id, email, password_hash, name, created_at)

-- 工作空间
workspaces (id, name, owner_id, created_at)

-- 龙虾注册表
claws (id, claw_id, owner_id, workspace_id, name, status, last_heartbeat, created_at)

-- Agent 注册表
agents (id, agent_id, claw_id, name, capabilities, status, current_task_id, created_at)

-- 任务记录
tasks (id, task_id, agent_id, workspace_id, title, input, output, state, started_at, completed_at)

-- 资产档案
artifacts (id, artifact_id, task_id, agent_id, workspace_id, type, storage_url, content_hash, version, tags, created_at)

-- Agent 会话（API Key）
agent_sessions (id, claw_id, api_key_hash, connected_at, disconnected_at)
```

### Neo4j（工作流图）

```
节点类型：
(:AgentTask)  — 一个 agent 执行的一个任务
(:Agent)      — 一个 agent
(:Claw)       — 一只龙虾

边类型：
[:EXECUTED_BY]   — 任务由哪个 agent 执行
[:DATA_FLOW]     — A 的产出被 B 消费
[:SEQUENCE]      — A 完成后 B 开始（时序）
[:BELONGS_TO]    — Agent 属于哪只龙虾
```

---

## 5. API 设计

### REST API（前端调用）

```
# 账号
POST   /api/v1/auth/register
POST   /api/v1/auth/login

# 工作空间
POST   /api/v1/workspaces
GET    /api/v1/workspaces

# 龙虾管理
GET    /api/v1/workspaces/:id/claws          — 列出龙虾
GET    /api/v1/claws/:id                      — 龙虾详情（含 agent 列表）
GET    /api/v1/claws/:id/agents               — agent 列表及状态

# 任务记录
GET    /api/v1/workspaces/:id/tasks           — 任务列表（支持筛选）
GET    /api/v1/tasks/:id                      — 任务详情

# 资产档案
GET    /api/v1/workspaces/:id/artifacts       — 档案列表（支持筛选）
GET    /api/v1/artifacts/:id                  — 档案详情
GET    /api/v1/artifacts/:id/download         — 下载（预签名URL）

# 工作流图
GET    /api/v1/workspaces/:id/workflow-graph  — 自动生成的工作流图数据

# 活动日志
GET    /api/v1/workspaces/:id/activity        — 活动事件流
```

### WebSocket（龙虾端，通信协议）

```
# 龙虾 → 后端
register          — 注册龙虾和 agent 列表
heartbeat         — 心跳
task_started      — agent 开始任务
task_completed    — agent 完成任务（含产出）
task_failed       — agent 任务失败
agent_status      — agent 状态变更

# 后端 → 龙虾
register_ack      — 注册确认
```

### WebSocket（前端，事件推送）

```
# 后端 → 前端
claw.connected       — 龙虾上线
claw.disconnected    — 龙虾离线
agent.status_changed — agent 状态变更
task.started         — 任务开始
task.completed       — 任务完成
task.failed          — 任务失败
artifact.created     — 新档案产生
workflow.updated     — 工作流图更新
```

---

## 6. 开发任务分解

### Sprint 1：连接层（1-2 周）

| 任务 | 说明 | 代码目录 |
|------|------|---------|
| S1-1 | claw-sdk 核心：连接、注册、心跳、断线重连 | `src/claw-sdk/` |
| S1-2 | 后端 WebSocket 服务：接受连接、验证、连接池管理 | `src/connector/protocol/` |
| S1-3 | 连接管理器：龙虾在线状态、agent 状态追踪 | `src/connector/sync/` |
| S1-4 | 状态上报处理：接收 task_started/completed/failed | `src/connector/adapter/` |
| S1-5 | 数据库建表 + 基础 CRUD | `src/infra/db/` |
| S1-6 | claw-sdk 使用示例 + 文档 | `src/claw-sdk/README.md` |

**Sprint 1 验收**：一只龙虾通过 SDK 连上后端，后端能看到 agent 列表和状态。

### Sprint 2：Brain + 档案基础版（1-2 周）

| 任务 | 说明 | 代码目录 |
|------|------|---------|
| S2-1 | 龙虾注册表 CRUD | `src/brain/account/` |
| S2-2 | 任务记录写入和查询 | `src/brain/` |
| S2-3 | 状态时间线记录 | `src/brain/` |
| S2-4 | 资产档案 CRUD（元数据） | `src/brain/` |
| S2-5 | 文件上传/下载（R2/MinIO 对接） | `src/infra/storage/` |
| S2-6 | 预签名 URL 生成 | `src/infra/storage/` |
| S2-7 | REST API 路由注册 | `src/infra/gateway/` |

**Sprint 2 验收**：龙虾 agent 完成任务后，产出自动存入档案库，能通过 API 查询任务和档案。

### Sprint 3：工作流自动可视化（1-2 周）

| 任务 | 说明 | 代码目录 |
|------|------|---------|
| S3-1 | 行为观察引擎：监听事件，提取 agent 间关系 | `src/workflow/` |
| S3-2 | 工作流图生成：从任务历史构建 DAG | `src/workflow/parser/` |
| S3-3 | 工作流图存储（Neo4j） | `src/infra/db/` |
| S3-4 | 工作流图查询 API | `src/workflow/` |
| S3-5 | 工作流图实时更新（新任务触发重建） | `src/workflow/` |

**Sprint 3 验收**：多个 agent 执行任务后，系统自动生成工作流图，能通过 API 获取图数据。

### Sprint 4：前端（1-2 周）

| 任务 | 说明 | 代码目录 |
|------|------|---------|
| S4-1 | 项目搭建（React + Vite + TailwindCSS） | `src/frontend/` |
| S4-2 | 登录/注册页 | `src/frontend/` |
| S4-3 | 主布局（龙虾面板 + 地图 + 档案面板 + 活动日志） | `src/frontend/layout/` |
| S4-4 | 龙虾面板：龙虾列表、agent 列表、状态指示 | `src/frontend/` |
| S4-5 | 工作流地图：React Flow 渲染、节点颜色、点击详情 | `src/frontend/map/` |
| S4-6 | 资产档案面板：列表、筛选、详情、下载 | `src/frontend/` |
| S4-7 | 活动日志：实时事件流 | `src/frontend/` |
| S4-8 | WebSocket 实时更新（agent 状态 → 地图节点） | `src/frontend/realtime/` |

**Sprint 4 验收**：完整的单人工作台界面，实时显示龙虾状态、工作流图、资产档案。

### Sprint 5：集成测试 + 端到端验证（1 周）

| 任务 | 说明 |
|------|------|
| S5-1 | 端到端测试：SDK 连接 → 任务执行 → 状态更新 → 档案归档 → 前端显示 |
| S5-2 | 模拟龙虾：用 claw-sdk 写一个测试龙虾，模拟多个 agent 执行任务 |
| S5-3 | 压力测试：多只龙虾同时连接 |
| S5-4 | 断线恢复测试：龙虾断线后重连，状态是否正确恢复 |
| S5-5 | Bug 修复 + 体验优化 |

**Sprint 5 验收**：完整闭环演示 — 龙虾接入，agent 工作，前端实时可见，档案可查。

---

## 7. 验收标准（阶段一整体）

- [ ] 龙虾通过 claw-sdk 能在 30 秒内完成连接和注册
- [ ] 前端实时显示龙虾在线状态和 agent 列表
- [ ] agent 执行任务时，工作流地图节点颜色实时变化
- [ ] 任务完成后，产出自动出现在资产档案面板
- [ ] 多个 agent 的任务链条自动生成工作流图
- [ ] 龙虾断线后重连，历史数据不丢失
- [ ] 单人使用，不需要配置权限
- [ ] 整体延迟 < 2 秒（从 agent 状态变化到前端更新）

---

## 8. 不做清单（阶段一明确不做）

- ❌ 工作流编辑（阶段二）
- ❌ 意图层（阶段二）
- ❌ 认知模块（阶段二）
- ❌ 独立应用节点（阶段二）
- ❌ 对话层（阶段二）
- ❌ 多人协作（阶段三）
- ❌ 权限模块（阶段三）
- ❌ 工作流生成器/编译器（阶段二）
- ❌ 意图变化缓冲（阶段二）
