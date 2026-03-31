# 阶段一：界面与数据设计

> 基于 v3.0 需求 + 双数据源适配方案 + OpenClaw 实际 md 文件分析

---

# 一、业务信息实体

## 核心实体关系

```
User (1) ──owns──→ (N) Workspace
Workspace (1) ──contains──→ (N) Claw
Claw (1) ──contains──→ (N) Agent
Agent (1) ──has──→ (6) CoreFile (SOUL/IDENTITY/AGENTS/TOOLS/USER/HEARTBEAT)
CoreFile (1) ──has──→ (N) FileVersion
Agent (1) ──executes──→ (N) Execution
Execution (1) ──produces──→ (N) Artifact
Execution (1) ──spawns──→ (N) Execution (Subagent)
Agent (N) ──relates──→ (N) Agent (AgentRelation)
```

## 关键字段定义

### Claw（龙虾）

```
claw_id          — 唯一标识（来自 OpenClaw deviceId）
name             — 龙虾名称
openclaw_dir     — 本地路径（~/.openclaw/）
owner_id         — 主人（用户 ID）
workspace_id     — 所属工作空间
status           — online | offline
gateway_port     — Gateway 端口
config_hash      — openclaw.json 的 hash
last_heartbeat   — 最后心跳时间
registered_at    — 注册时间
```

### Agent

```
agent_id         — 唯一标识（来自 openclaw.json 的 agent key）
claw_id          — 属于哪只龙虾
name             — 显示名称（来自 IDENTITY.md）
emoji            — 图标（来自 IDENTITY.md）
model            — 使用的模型
status           — idle | running | failed
workspace_path   — Agent 工作空间相对路径
capabilities     — 能力标签列表（从 TOOLS.md 提取）
current_task     — 当前执行的任务
last_active_at   — 最后活跃时间
registered_at    — 注册时间
```

### CoreFile（Agent 核心文件）

```
id               — 唯一标识
agent_id         — 属于哪个 Agent（null = 全局文件）
claw_id          — 属于哪只龙虾
file_type        — soul | identity | agents | tools | user | heartbeat
file_path        — 相对路径
current_hash     — 当前文件 hash
current_content  — 当前文件内容
version_count    — 变更次数
last_changed_at  — 最后变更时间
```

### FileVersion（文件版本）

```
id               — 唯一标识
core_file_id     — 关联的核心文件
version          — 版本号（递增）
hash             — 该版本的 hash
content          — 该版本完整内容
diff_from_prev   — 与上一版的 diff
created_at       — 版本创建时间
```

### Execution（任务执行）

```
id               — 唯一标识
execution_id     — OpenClaw 的 runId
agent_id         — 执行的 Agent
claw_id          — 属于哪只龙虾
session_id       — 会话 ID
trigger          — user | cron | heartbeat | subagent
status           — running | completed | failed | timeout
input_preview    — 输入摘要（前 200 字）
output_preview   — 输出摘要（前 200 字）
error_message    — 错误信息
token_input      — 输入 token 数
token_output     — 输出 token 数
token_total      — 总 token 数
tool_calls       — 工具调用列表 [{name, input_preview, output_preview}]
artifact_ids     — 产出的档案 ID 列表
parent_execution_id — 父任务（Subagent 场景）
started_at       — 开始时间
completed_at     — 完成时间
duration_ms      — 耗时
source           — hook | session_file（数据来源，用于去重）
```

### Artifact（产出档案）

```
id               — 唯一标识
artifact_id      — 档案唯一标识
execution_id     — 来源任务
agent_id         — 产出 Agent
claw_id          — 属于哪只龙虾
workspace_id     — 所属工作空间
type             — document | code | data | media | config
file_path        — 文件路径
file_hash        — 内容 hash
file_size        — 文件大小
version          — 版本号
tags             — 标签列表
created_at       — 创建时间
updated_at       — 最后更新时间
```

### AgentRelation（Agent 间关系）

```
id               — 唯一标识
source_agent_id  — 起始 Agent
target_agent_id  — 目标 Agent
relation_type    — collaboration | subagent | data_flow
source_info      — 关系来源说明
strength         — 关系强度（协作次数）
first_seen_at    — 首次发现时间
last_seen_at     — 最近一次
```

---

# 二、业务流

## 流一：龙虾接入（一次性）

```
用户指定 ~/.openclaw/ 路径
  → 读取 openclaw.json → 提取龙虾信息和 Agent 列表
  → 读取每个 Agent 的核心文件 → 建立初始画像
  → 计算所有文件 hash → 存储初始快照
  → 龙虾注册完成
```

## 流二：文件 hash 追踪（持续运行，10 秒一轮）

```
扫描所有追踪文件 → 计算 hash
  → 与上次快照对比
  → 没变 → 跳过
  → 变了 → 读取新内容 → 计算 diff → 存储新版本
       → 是核心文件？→ 推送到前端（Agent 定义更新了）
       → 是会话文件？→ 增量解析新行 → 提取任务事件
       → 是工作空间文件？→ 记录产出变更
```

## 流三：Hook 事件接收（实时）

```
OpenClaw Plugin 发出事件
  → ClawTeams WebSocket 接收
  → 按事件类型处理：
     claw_online      → 更新龙虾在线状态
     claw_offline     → 更新龙虾离线状态
     agent_execution  → 记录任务执行 + 去重
     subagent_spawned → 记录 Agent 间协作边
     subagent_ended   → 更新协作结果
  → 推送到前端
```

## 流四：工作流图生成

```
数据来源（按优先级）：
  1. md 文件中定义的协作关系（静态骨架）
  2. Subagent spawn 事件（动态边）
  3. 档案传递（A 的产出被 B 引用）
  → 合并生成拓扑图数据（节点 + 边）
  → 推送到前端渲染
```

---

# 三、md 文件解析规则

## 解析总览

md 文件是工作流骨架的来源。三层信息：

```
第一层：Agent 身份和配置（结构化，正则/JSON 提取）
第二层：Agent 职责和协作关系（半结构化，表格+流程解析）
第三层：业务模型和数据 Schema（高度结构化，表格解析）
```

## 逐文件解析规则

### openclaw.json → ClawRegistration

**解析方式**：JSON 路径查询

```typescript
interface ClawRegistration {
  claw_id: string;           // identity/device.json → deviceId
  gateway_port: number;      // gateway.port
  model_default: string;     // agents.defaults.model.primary
  model_fallbacks: string[];
  agents: AgentRegistration[];
  channels: string[];
}

interface AgentRegistration {
  agent_id: string;          // list[].id
  name: string;              // list[].name
  emoji: string;             // list[].identity.emoji
  theme: string;             // list[].identity.theme
  model: string;             // list[].model
  workspace_path: string;    // list[].workspace
}
```

### IDENTITY.md → AgentIdentity

**解析方式**：正则 KV `/^-\s*(\w[\w\s]*?):\s*(.+)$/gm`

```typescript
interface AgentIdentity {
  name: string;        // "Butterfly"
  creature: string;    // "strategy analyst familiar"
  vibe: string;        // "sharp, skeptical, probability-first"
  emoji: string;       // "🦋"
  avatar?: string;
}
```

### SOUL.md → AgentSoul

**解析方式**：段落分割 + 关键词提取

```typescript
interface AgentSoul {
  principles: string[];
  boundaries: {
    can_do: string[];
    must_ask: string[];
    never_do: string[];
  };
  personality: string;
  raw_content: string;
}
```

### AGENTS.md → AgentWorkProtocol

**解析方式**：步骤序列 + 表格解析

```typescript
interface AgentWorkProtocol {
  boot_sequence: string[];
  permission_zones: {
    internal_safe: string[];
    external_sensitive: string[];
    group_rules: string[];
  };
  memory_config: {
    daily_log: string;
    long_term: string;
    heartbeat_state: string;
  };
  scheduling: {
    heartbeat_purpose: string;
    cron_purpose: string;
  };
}
```

### TOOLS.md → AgentTools

**解析方式**：标题分段 + KV 列表

```typescript
interface AgentTools {
  configurations: {
    category: string;
    items: Record<string, string>[];
  }[];
  raw_content: string;
}
```

### USER.md → UserProfile

**解析方式**：正则 KV（同 IDENTITY.md）

```typescript
interface UserProfile {
  name: string;
  call_them: string;
  pronouns: string;
  timezone: string;
  notes: string;
  context: string;
}
```

### HEARTBEAT.md → HeartbeatConfig

**解析方式**：列表项提取

```typescript
interface HeartbeatConfig {
  tasks: { description: string; frequency?: string }[];
  is_empty: boolean;
}
```

### 多代理职责划分.md → AgentNetwork

**解析方式**：表格解析 + 流程箭头识别

```typescript
interface AgentNetwork {
  agents: {
    agent_id: string;
    role: string;
    responsibilities: string[];
    outputs: string[];
    not_responsible: string[];
  }[];
  workflow_chain: {
    type: "sequential" | "parallel" | "crosscut";
    nodes: string[];
  }[];
  edges: {
    from: string;
    to: string;
    relation: string;
  }[];
}
```

### 五代理系统总览.md → SystemOverview

**解析方式**：表格解析 + 层级标题分段

```typescript
interface SystemOverview {
  architecture: { orchestrator: string; agents: string[] };
  cadence: {
    agent_id: string;
    daily: string;
    weekly: string;
    biweekly: string;
  }[];
  business_chain: string;
  growth_chain: string;
  redteam_severity: {
    level: string;
    meaning: string;
    action: string;
    auto_continue: boolean;
  }[];
}
```

### 核心数据模型与 schema.md → BusinessSchema

**解析方式**：表格结构化解析

```typescript
interface BusinessSchema {
  objects: {
    name: string;
    purpose: string;
    fields: { name: string; type: string; description: string; enum_values?: string[] }[];
    owner_agent?: string;
  }[];
  object_chain: string[];
  crosscut_objects: string[];
}
```

### 状态机设计.md → StateMachine

**解析方式**：状态图解析 + 转移条件表格

```typescript
interface StateMachine {
  entity: string;
  states: { name: string; description: string }[];
  transitions: {
    from: string;
    to: string;
    condition: string;
    trigger_agent?: string;
  }[];
  terminal_states: string[];
}
```

### Agent 工作定义.md → AgentWorkDefinition

**解析方式**：多级标题分段 + 列表/表格

```typescript
interface AgentWorkDefinition {
  agent_id: string;
  core_duties: string[];
  sources: { tier: string; items: string[]; rules?: string[] }[];
  admission_criteria: string[];
  output_objects: { name: string; upgrade_path?: string; threshold?: string[] }[];
  scoring: { dimension: string; levels: string[] }[];
  cadence: { frequency: string; work: string; goal: string }[];
  hard_boundaries: string[];
}
```

### Redteam 治理机制.md → RedteamGovernance

```typescript
interface RedteamGovernance {
  first_principle: string;
  authority: { has: string; not_has: string };
  severity_levels: { level: string; meaning: string; action: string; auto_continue: boolean }[];
  engagement_modes: { mode: string; description: string }[];
}
```

## 文件 → 解析 → 展示映射

| 文件 | 输出结构 | 展示位置 |
|------|---------|---------|
| openclaw.json | ClawRegistration | 左侧面板（Agent 列表） |
| IDENTITY.md | AgentIdentity | 左侧面板 + 详情面板 |
| SOUL.md | AgentSoul | 详情面板（行为边界） |
| AGENTS.md | AgentWorkProtocol | 详情面板（工作协议） |
| TOOLS.md | AgentTools | 详情面板（工具配置） |
| USER.md | UserProfile | 详情面板（服务对象） |
| HEARTBEAT.md | HeartbeatConfig | 拓扑图 + 时间线 |
| 多代理职责划分 | AgentNetwork | **拓扑图骨架** |
| 五代理系统总览 | SystemOverview | **拓扑图节拍标注** + 网格 |
| 数据模型 schema | BusinessSchema | **档案视图对象链** |
| 状态机设计 | StateMachine | **拓扑图状态颜色** + 详情 |
| Agent 工作定义 | AgentWorkDefinition | 详情面板（完整规范） |
| Redteam 治理 | RedteamGovernance | 详情面板（治理规则） |

---

# 四、界面布局

## 主布局

```
┌─────────────────────────────────────────────────┐
│  顶部栏：工作空间名 + 龙虾连接状态(🟢在线)       │
├─────────────┬───────────────────────────────────┤
│             │                                   │
│  左侧面板   │         主区域（可切换视图）        │
│  龙虾+Agent │  [拓扑图] [时间线] [网格] [档案]   │
│  列表       │                                   │
│             │                                   │
│             │                                   │
│             │                                   │
├─────────────┴───────────────────────────────────┤
│  底部：活动日志（实时滚动）                       │
└─────────────────────────────────────────────────┘
```

## 四个视图

1. **拓扑图**（默认）：Agent 节点 + 协作连线 + 状态颜色
2. **时间线**：按时间轴展示任务执行过程
3. **网格**：Agent × 运行次数矩阵
4. **档案**：产出文件列表 + 血统链

## 状态颜色

```
⚪ 灰色   — 空闲 / 未执行
🔵 蓝色   — 执行中
🟢 绿色   — 成功完成
🔴 红色   — 失败
🟡 黄色   — 等待人工 / 重试中
🟣 紫色   — 文件版本变更（Agent 定义更新了）
```

---

# 五、信息分层（渐进展示）

## 原则

```
第零层：一眼扫过（默认）     — emoji、颜色、数字，无文字
第一层：悬停浮出（200ms）   — 一句话摘要 + 关键指标
第二层：点击展开（详情面板） — 折叠式关键字段
第三层：二次展开            — 完整内容 / 原文 / diff
```

## 左侧面板

**第零层**：emoji + 短名 + 状态色点
```
🦞 Kermit的龙虾 🟢
├── 🦋 invest    🔵
├── ⚡ trigger    ⚪
└── 🛡️ redteam   ⚪
```

**第一层（悬停）**：角色名 + 模型 + 当前任务
```
├── 🦋 invest    🔵
│   策略分析师 · gpt-5.4
│   正在执行"市场扫描" 3min
```

同时主区域拓扑图中对应节点高亮 + 脉冲动画（左右联动）。

## 拓扑图

**第零层**：只有 emoji 节点 + 连线，无文字
```
[⚡] ──→ [🦋] ──→ [🛡️]
 │               ↑
 └──→ [🧠] ──→ [🗺️]
```

**第一层（悬停节点）**：节点放大 + 浮出信息卡 + 非关联节点淡化到 30%
```
    ┌─────────────────┐
    │ ⚡ Trigger        │
    │ 信号侦察员       │
    │ 今日: 3次 🟢🟢🔴  │
    └─────────────────┘
```

**悬停边**：线条加粗 + 浮出关系说明
```
  ┌──────────────┐
  │ 交付: 主题卡  │
  │ 协作 15 次    │
  └──────────────┘
```

## 时间线

**第零层**：emoji + 条形 + 状态色，无文字
```
09:00  🦋  ████████████  🟢
09:05  ⚡  ████          🟢
09:30  🛡️  ██            🔴
```

**第一层（悬停条形）**：任务名 + 时间 + token + 工具调用次数
```
┌──────────────────────┐
│ 市场扫描              │
│ 09:00 → 09:12  12min │
│ 1.2K tokens  🔧×3    │
└──────────────────────┘
```

## 网格

**第零层**：纯符号 ● = 成功 ○ = 失败 — = 无
```
        3/30  3/29  3/28
🦋      ●●○●  ●●●   ●●
⚡      ●●    ●●●●  ●●
🛡️      ○●    ●●    ●
```

**第一层（悬停色块）**：该次执行摘要

## 档案

**第零层**：图标 + 文件名 + Agent emoji + 时间
```
📄 市场扫描报告.md      🦋  09:12
📊 信号检测结果.json    ⚡  09:09
```

**第一层（悬停）**：大小 + 版本 + 内容预览前 3 行 + 上下游血统

## 活动日志

**第零层**：时间 + emoji + 状态 + 一句话
```
18:09  ⚡ 🟢 完成  "信号检测"
18:00  🟣 文件变更  🦋 SOUL.md
```

**第一层（悬停）**：详细指标或 diff 预览

## 详情面板（第二层，点击后展开）

折叠式设计，每个块对应一个解析结构：

```
┌────────────────────────────────┐
│ 🦋 Butterfly · 策略分析师        │  ← 始终显示
│ 🔵 执行中 · gpt-5.4             │
├────────────────────────────────┤
│ ▸ 身份定义          ← AgentIdentity
│ ▸ 行为边界 (SOUL)   ← AgentSoul
│ ▸ 工具配置          ← AgentTools
│ ▾ 协作关系          ← AgentNetwork.edges
│   → ⚡ Trigger: 接收信号交付
│   → 🧠 Variable: 交付变量分析
│   ← 🛡️ Redteam: 接受横切挑战
│ ▸ 核心文件版本      ← FileVersion
│ ▾ 今日执行 (5次)    ← Execution
│   🟢 09:00 市场扫描 12min 1.2K
│   🔴 10:05 风险评估 (速率限制)
│ ▸ 产出档案 (3个)    ← Artifact
│ ▸ 运行节拍          ← SystemOverview.cadence
└────────────────────────────────┘
```

---

# 六、数据刷新频率

| 数据 | 刷新方式 | 频率 |
|------|---------|------|
| Agent 实时状态 | Hook 事件推送 | **即时** |
| 龙虾在线/离线 | Hook 事件推送 | **即时** |
| Subagent 协作 | Hook 事件推送 | **即时** |
| 核心文件变更 | 文件 hash 轮询 | **10 秒** |
| 会话文件增量 | 文件 mtime 轮询 | **10 秒** |
| 工作空间产出文件 | 文件 hash 轮询 | **30 秒** |
| 工作流图重建 | 触发式 | **按需** |
| 网格历史数据 | 手动刷新 | **不自动** |

前端更新方式：

| UI 区域 | 更新触发 |
|---------|---------|
| 节点状态颜色 | WebSocket 推送 → 立即变色 |
| 时间线新条目 | WebSocket 推送 → 追加 |
| 活动日志 | WebSocket 推送 → 滚动追加 |
| 紫色文件变更标记 | 10秒轮询 → 推送 |
| 拓扑图结构 | 新边/节点出现 → 动画过渡 |

---

# 七、变化提示动画

## 三级提示

### 静默变化（不闪，只变色）

| 场景 | 表现 |
|------|------|
| Agent 空闲→执行中 | ⚪ 过渡到 🔵，无闪烁 |
| 任务正常完成 | 🔵 过渡到 🟢，3秒后变淡 |
| 新活动日志条目 | 新行滑入，高亮 1 秒后恢复 |
| 档案列表新增 | 新行滑入，高亮 1 秒后恢复 |

### 需注意变化（脉冲一次，不持续）

| 场景 | 表现 |
|------|------|
| 核心文件变更 | 🟣 紫色边框脉冲 3 次后常亮 |
| 拓扑图出现新边 | 虚线渐变为实线，发光 2 秒 |
| Subagent 被 spawn | 新节点缩放弹入，脉冲 2 次 |
| 时间线新执行 | 新条形滑入，背景闪亮 1 次 |

### 需关注变化（持续提示，直到用户确认）

| 场景 | 表现 |
|------|------|
| 任务失败 | 🔴 持续慢闪，直到用户点击查看 |
| 龙虾离线 | 顶部 🔴 持续闪烁 + 横幅提示 |
| Redteam 高/致命挑战 | 🛡️ 红色脉冲 + 链路高亮 |

## 动画规则

| 规则 | 说明 |
|------|------|
| 同时闪烁不超过 2 处 | 多个变化同时发生时只闪最重要的 |
| 脉冲最多 3 次 | "需注意"级别闪 3 次后停 |
| 持续闪烁只给错误和离线 | 只有需要处理的事才持续 |
| 用户点击后立即停闪 | 确认已看到就安静 |
| 可选关闭所有动画 | 夜间/专注模式只保留颜色变化 |

**原则：正常运行时界面安静，出了问题才闪。**

---

# 八、数据来源汇合

## 三层数据合成工作流图

```
第一步：解析 md 文件 → 生成工作流图骨架（静态结构）
第二步：Hook 事件 + 会话文件 → 给节点填上实时状态（动态数据）
第三步：文件 hash 追踪 → 记录结构演化（版本变更）
```

md 文件是骨架，运行时数据是血肉。

## 数据完整性矩阵

| 数据 | 文件追踪 | Hook | 合并后 |
|------|---------|------|--------|
| Agent 列表 | ✅ openclaw.json | ✅ gateway_start | ✅ |
| Agent 角色/身份 | ✅ IDENTITY.md | — | ✅ |
| Agent 行为定义 | ✅ SOUL.md | — | ✅ |
| 协作关系 | ✅ AGENTS.md + 职责划分 | ✅ subagent 事件 | ✅ |
| 定时任务 | ✅ HEARTBEAT.md | — | ✅ |
| 工具能力 | ✅ TOOLS.md | — | ✅ |
| 龙虾在线状态 | — | ✅ gateway_start/stop | ✅ |
| Agent 实时状态 | ⚠️ 10秒延迟 | ✅ 实时 | ✅ |
| 执行历史 | ✅ session JSONL | ✅ agent_end | ✅ |
| Token 用量 | ✅ session JSONL | ✅ agent_end | ✅ |
| Subagent 协作 | ⚠️ 需推断 | ✅ subagent 事件 | ✅ |
| 定义文件演化 | ✅ 版本 diff | — | ✅ |
| 工作产出 | ✅ 文件变更 | — | ✅ |
| 业务对象 schema | ✅ 数据模型.md | — | ✅ |
| 状态机 | ✅ 状态机设计.md | — | ✅ |

合并后无盲区。
