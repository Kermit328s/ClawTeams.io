# OpenClaw 适配层开发手册

> 基于 OpenClaw 代码库深度调研
> 目的：为 ClawTeams 阶段一开发提供 OpenClaw 接入方案

---

## 1. OpenClaw 架构概览

### 项目基本信息

- **仓库**: github.com/openclaw/openclaw
- **语言**: TypeScript
- **架构**: pnpm workspace monorepo
- **描述**: 个人 AI 助手平台，支持多模型、多通道、插件系统

### 核心架构

```
OpenClaw
├── Gateway（WS 控制平面）— 管理连接和消息路由
├── Agent 运行时 — 执行 LLM 推理 + 工具调用循环
│   └── Subagent 系统 — Agent 可以生成子 Agent
├── Plugin 系统 — 28 个 Hook + 工具注册
├── Channel 系统 — Telegram/Discord/Slack 等通道
├── Task 系统 — 任务注册表（SQLite）
├── Session 系统 — 会话持久化（JSONL 文件）
└── MCP 集成 — Model Context Protocol 工具
```

---

## 2. ClawTeams 需要透视的关键数据

### 2.1 龙虾 = 一个 OpenClaw 实例

一个运行中的 OpenClaw 进程就是一只"龙虾"。它内部有：
- **多个 Agent（对应 ClawTeams 的 agent）** — 通过配置文件定义多个命名 Agent
- **Subagent** — Agent 运行时可动态生成子 Agent
- **会话** — 每个 Agent 有独立的会话和历史

### 2.2 Agent 标识体系

| OpenClaw 概念 | ClawTeams 映射 | 来源 |
|--------------|---------------|------|
| 整个 OpenClaw 实例 | claw_id（龙虾） | 由 ClawTeams 在注册时生成 |
| `agentId`（配置中的命名 Agent） | agent_id | `openclaw.json → agents.<id>` |
| `sessionId` | 会话标识 | UUID，每次 /reset 重新生成 |
| `sessionKey` | 会话路由键 | 格式如 `telegram:123@user` |
| `runId` | 单次执行标识 | 每次执行生成的 UUID |

### 2.3 需要捕获的运行时数据

| 数据 | OpenClaw 来源 | 获取方式 |
|------|-------------|---------|
| Agent 列表和配置 | `openclaw.json → agents` | 注册时读取配置 |
| Agent 当前状态 | 命令队列 + 运行状态 | Hook: `before_model_resolve` / `agent_end` |
| 任务开始 | `runEmbeddedPiAgent` 调用 | Hook: `before_agent_start` |
| 任务完成/失败 | `EmbeddedPiRunResult` 返回 | Hook: `agent_end` |
| 工具调用详情 | 工具执行过程 | Hook: `before_tool_call` / `after_tool_call` |
| 产出内容 | `EmbeddedPiRunResult.payloads` | Hook: `agent_end` |
| Subagent 生成 | 子 Agent 生命周期 | Hook: `subagent_spawned` / `subagent_ended` |
| 会话消息 | JSONL 会话文件 | Hook: `message_sent` / `message_received` |
| Token 用量 | `EmbeddedPiAgentMeta.usage` | Hook: `agent_end` |

---

## 3. 适配层实现方案：OpenClaw Plugin

### 3.1 为什么选择 Plugin 方案

OpenClaw 有完善的 Plugin 系统（28 个 Hook），这是最干净的接入方式：
- **不修改 OpenClaw 代码** — 纯插件，独立安装
- **覆盖完整生命周期** — 从 Agent 启动到结束的每个阶段都有 Hook
- **官方支持的扩展方式** — 有 Plugin SDK 和开发文档

### 3.2 Plugin 目录结构

```
extensions/clawteams/
├── package.json
├── src/
│   ├── index.ts              # 插件入口，注册所有 Hook
│   ├── clawteams-client.ts   # WebSocket 客户端（连接 ClawTeams 后端）
│   ├── hooks/
│   │   ├── agent-lifecycle.ts  # Agent 启动/结束 Hook
│   │   ├── tool-tracking.ts    # 工具调用追踪 Hook
│   │   ├── subagent-tracking.ts # Subagent 生命周期 Hook
│   │   ├── message-tracking.ts  # 消息流转 Hook
│   │   └── context-inject.ts    # 上下文注入 Hook
│   ├── state/
│   │   ├── agent-state.ts      # 本地 Agent 状态管理
│   │   ├── task-buffer.ts      # 任务事件缓冲（断线时）
│   │   └── artifact-collector.ts # 产出收集
│   └── types.ts                # ClawTeams 适配层类型
└── README.md
```

### 3.3 Plugin 入口实现骨架

```typescript
// extensions/clawteams/src/index.ts
import type { PluginEntryParams } from "openclaw/plugin-sdk";

export default function clawteamsPlugin(params: PluginEntryParams) {
  const { api, config } = params;

  // 读取 ClawTeams 配置
  const ctConfig = config.get("clawteams") as {
    serverUrl: string;     // ClawTeams 后端 WebSocket 地址
    clawId: string;        // 龙虾 ID（注册时获取）
    apiKey: string;        // 认证密钥
  };

  // 初始化 ClawTeams 客户端
  const client = new ClawTeamsClient(ctConfig);

  // ──── 龙虾注册（Gateway 启动时）────
  api.on("gateway_start", async () => {
    const agents = config.get("agents");
    await client.register({
      claw_id: ctConfig.clawId,
      agents: Object.entries(agents).map(([id, cfg]) => ({
        agent_id: id,
        capabilities: extractCapabilities(cfg),
      })),
    });
  });

  // ──── Agent 生命周期追踪 ────
  api.on("before_model_resolve", async (event) => {
    await client.reportTaskStarted({
      agent_id: event.agentId,
      run_id: event.runId,
      session_id: event.sessionId,
      trigger: event.triggerEvent,
      prompt_preview: event.prompt?.substring(0, 200),
    });
    return {};
  });

  api.on("agent_end", async (event) => {
    await client.reportTaskCompleted({
      agent_id: event.agentId,
      run_id: event.runId,
      result: event.result,
      meta: event.meta,
      artifacts: collectArtifacts(event.result),
    });
    return {};
  });

  // ──── 工具调用追踪 ────
  api.on("before_tool_call", async (event) => {
    await client.reportToolCall({
      agent_id: event.agentId,
      tool_name: event.toolName,
      tool_input: event.input,
      phase: "started",
    });
    return {};
  });

  api.on("after_tool_call", async (event) => {
    await client.reportToolCall({
      agent_id: event.agentId,
      tool_name: event.toolName,
      tool_result: event.result,
      phase: "completed",
    });
    return {};
  });

  // ──── Subagent 追踪 ────
  api.on("subagent_spawned", async (event) => {
    await client.reportSubagentSpawned({
      parent_agent_id: event.requesterSessionKey,
      child_agent_id: event.childSessionKey,
      task: event.task,
    });
    return {};
  });

  api.on("subagent_ended", async (event) => {
    await client.reportSubagentEnded({
      child_agent_id: event.childSessionKey,
      status: event.outcome,
      result: event.terminalSummary,
    });
    return {};
  });

  // ──── 上下文注入（从 ClawTeams Brain 拉取）────
  api.on("before_prompt_build", async (event) => {
    const context = await client.getContext(event.agentId);
    if (context) {
      return {
        prependContext: context,
      };
    }
    return {};
  });

  // ──── 心跳 ────
  setInterval(() => {
    client.heartbeat();
  }, 30_000);

  // ──── 网关停止时断开 ────
  api.on("gateway_stop", async () => {
    await client.disconnect();
    return {};
  });
}
```

---

## 4. Hook 详细映射

### 4.1 ClawTeams 需要使用的 Hook

| Hook | 触发时机 | ClawTeams 用途 | 优先级 |
|------|---------|---------------|--------|
| `gateway_start` | OpenClaw 启动 | 注册龙虾 + Agent 列表 | **P0** |
| `gateway_stop` | OpenClaw 停止 | 断开连接 | **P0** |
| `before_model_resolve` | Agent 开始执行 | 报告任务开始 | **P0** |
| `agent_end` | Agent 执行完成 | 报告任务结束 + 收集产出 | **P0** |
| `before_tool_call` | 工具调用前 | 记录工具调用（细粒度） | P1 |
| `after_tool_call` | 工具调用后 | 记录工具结果（细粒度） | P1 |
| `subagent_spawned` | 子 Agent 生成 | 记录 Agent 间协作 | **P0** |
| `subagent_ended` | 子 Agent 完成 | 记录协作结果 | **P0** |
| `before_prompt_build` | 提示词构建前 | 注入 ClawTeams 上下文 | P1 |
| `message_sent` | 消息发送 | 记录通道消息 | P2 |
| `message_received` | 消息接收 | 记录入站消息 | P2 |
| `session_start` | 会话开始 | 追踪会话生命周期 | P2 |
| `session_end` | 会话结束 | 追踪会话生命周期 | P2 |

### 4.2 每个 Hook 的数据提取

#### `before_model_resolve`（任务开始）

```typescript
// OpenClaw 传入的 event 结构
{
  agentId: string;        // Agent 标识
  sessionId: string;      // 会话 ID
  runId: string;          // 执行 ID
  prompt: string;         // 用户输入
  triggerEvent: "user" | "cron" | "heartbeat" | "memory" | "overflow";
  provider?: string;      // LLM 供应商
  model?: string;         // 模型 ID
}

// 转换为 ClawTeams task_started 事件
{
  event_type: "task.started",
  agent_id: event.agentId,
  task_id: event.runId,       // 用 runId 作为任务 ID
  payload: {
    trigger: event.triggerEvent,
    model: `${event.provider}/${event.model}`,
    prompt_preview: event.prompt?.substring(0, 200),
  }
}
```

#### `agent_end`（任务完成）

```typescript
// OpenClaw 传入的 event 结构
{
  agentId: string;
  runId: string;
  result: EmbeddedPiRunResult;  // 包含 payloads 和 meta
  meta: EmbeddedPiRunMeta;      // 包含 durationMs, usage, error 等
}

// 转换为 ClawTeams task_completed 事件
{
  event_type: event.meta.error ? "task.failed" : "task.completed",
  agent_id: event.agentId,
  task_id: event.runId,
  payload: {
    duration_ms: event.meta.durationMs,
    token_usage: event.meta.agentMeta?.usage,
    output_text: event.result.payloads?.map(p => p.text).join("\n"),
    output_media: event.result.payloads?.flatMap(p => p.mediaUrls || []),
    error: event.meta.error?.message,
    stop_reason: event.meta.stopReason,
  },
  artifact_ids: collectArtifacts(event.result),  // 从产出中提取
}
```

#### `subagent_spawned` / `subagent_ended`（Agent 间协作）

```typescript
// spawned → 记录协作关系（工作流的边）
{
  event_type: "agent.subagent_spawned",
  payload: {
    parent_session_key: event.requesterSessionKey,
    child_session_key: event.childSessionKey,
    task_description: event.task,
    spawn_mode: event.spawnMode,
    timeout_seconds: event.runTimeoutSeconds,
  }
}

// ended → 记录协作结果
{
  event_type: "agent.subagent_ended",
  payload: {
    child_session_key: event.childSessionKey,
    outcome: event.outcome,       // "success" | "timeout" | "error"
    ended_reason: event.endedReason,
    terminal_summary: event.terminalSummary,
  }
}
```

---

## 5. 通信协议设计

### 5.1 ClawTeams 客户端（Plugin 内部）

```typescript
// extensions/clawteams/src/clawteams-client.ts

export class ClawTeamsClient {
  private ws: WebSocket | null = null;
  private buffer: QueuedEvent[] = [];  // 断线缓冲
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private config: {
    serverUrl: string;
    clawId: string;
    apiKey: string;
  }) {}

  // ──── 连接管理 ────

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.config.serverUrl);
    this.ws.on("open", () => this.onConnected());
    this.ws.on("close", () => this.onDisconnected());
    this.ws.on("message", (data) => this.onMessage(data));
  }

  private async onConnected() {
    // 发送注册消息
    this.send({
      msg_type: "register",
      payload: {
        claw_id: this.config.clawId,
        api_key: this.config.apiKey,
      }
    });
    // 刷新缓冲区
    this.flushBuffer();
  }

  private onDisconnected() {
    // 指数退避重连
    this.scheduleReconnect();
  }

  // ──── 状态上报 ────

  async register(data: RegisterPayload) {
    this.send({ msg_type: "register", payload: data });
  }

  async reportTaskStarted(data: TaskStartedPayload) {
    this.sendOrBuffer({ msg_type: "task_started", payload: data });
  }

  async reportTaskCompleted(data: TaskCompletedPayload) {
    this.sendOrBuffer({ msg_type: "task_completed", payload: data });
  }

  async reportToolCall(data: ToolCallPayload) {
    this.sendOrBuffer({ msg_type: "tool_call", payload: data });
  }

  async reportSubagentSpawned(data: SubagentSpawnedPayload) {
    this.sendOrBuffer({ msg_type: "subagent_spawned", payload: data });
  }

  async reportSubagentEnded(data: SubagentEndedPayload) {
    this.sendOrBuffer({ msg_type: "subagent_ended", payload: data });
  }

  async heartbeat() {
    this.send({ msg_type: "heartbeat", payload: { timestamp: Date.now() } });
  }

  // ──── 上下文获取（从 ClawTeams Brain）────

  async getContext(agentId: string): Promise<string | null> {
    // 同步请求 ClawTeams 后端获取 agent 的工作上下文
    // 用于注入到 before_prompt_build
    return this.request({ msg_type: "get_context", payload: { agent_id: agentId } });
  }

  // ──── 断线缓冲 ────

  private sendOrBuffer(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(message);
    } else {
      this.buffer.push({ ...message, buffered_at: Date.now() });
    }
  }

  private flushBuffer() {
    while (this.buffer.length > 0) {
      const msg = this.buffer.shift()!;
      this.send(msg);
    }
  }
}
```

### 5.2 消息类型清单

| 方向 | 消息类型 | 说明 |
|------|---------|------|
| Plugin → ClawTeams | `register` | 龙虾注册（含 Agent 列表） |
| Plugin → ClawTeams | `heartbeat` | 心跳保活 |
| Plugin → ClawTeams | `task_started` | Agent 开始执行任务 |
| Plugin → ClawTeams | `task_completed` | Agent 完成任务 |
| Plugin → ClawTeams | `task_failed` | Agent 任务失败 |
| Plugin → ClawTeams | `tool_call` | 工具调用（开始/完成） |
| Plugin → ClawTeams | `subagent_spawned` | 子 Agent 生成 |
| Plugin → ClawTeams | `subagent_ended` | 子 Agent 完成 |
| Plugin → ClawTeams | `artifact_produced` | 产出文件/内容 |
| ClawTeams → Plugin | `register_ack` | 注册确认 |
| ClawTeams → Plugin | `context_response` | 上下文数据 |
| ClawTeams → Plugin | `config_update` | 配置变更通知 |

---

## 6. 工作流自动生成的数据来源

### 6.1 节点（工作流图的节点）

从以下事件中提取节点：

```
task_started → 创建节点（状态：执行中）
task_completed → 更新节点（状态：完成）
task_failed → 更新节点（状态：失败）
subagent_spawned → 创建子节点
```

每个节点包含：
```typescript
{
  node_id: runId,              // 任务执行 ID
  agent_id: agentId,           // 来自哪个 Agent
  label: prompt_preview,       // 任务描述（截取前 50 字）
  status: "running" | "completed" | "failed",
  started_at: timestamp,
  completed_at: timestamp,
  duration_ms: number,
  token_usage: { input, output, total },
  artifacts: string[],         // 产出档案 ID
}
```

### 6.2 边（工作流图的边）

从以下关系中提取边：

**① Subagent 关系（最直接）**
```
subagent_spawned 事件 → parent_session_key → child_session_key
= 一条边：父任务 → 子任务
```

**② 档案传递关系**
```
Agent A 产出 artifact_X
Agent B 的输入中引用了 artifact_X（通过 tool_call 的输入匹配）
= 一条边：A 的任务 → B 的任务
```

**③ 时序关系（弱关联）**
```
同一 Agent 的连续任务：task_1 完成后 task_2 开始
= 一条边：task_1 → task_2（顺序依赖）
```

### 6.3 自动工作流图示例

```
用户发消息 "帮我做一个市场调研报告"
  → Agent "主助手" 开始任务 (node_1, 🔵)
    → 调用 web_search 工具 (tool_call 记录)
    → 生成子 Agent "数据分析" (subagent_spawned)
      → 子 Agent 执行 (node_2, 🔵)
      → 子 Agent 完成 (node_2, 🟢)
    → 调用 exec 工具生成 PDF (tool_call 记录)
    → 产出 report.pdf (artifact_produced)
  → Agent "主助手" 完成 (node_1, 🟢)

自动生成的工作流图：
  [node_1: 市场调研] ──→ [node_2: 数据分析]
       │                      │
       └──── [artifact: report.pdf]
```

---

## 7. 产出（Artifact）收集策略

### 7.1 从哪里收集产出

| 产出类型 | OpenClaw 来源 | 收集方式 |
|---------|-------------|---------|
| 文本输出 | `EmbeddedPiRunResult.payloads[].text` | `agent_end` Hook |
| 媒体文件 | `payloads[].mediaUrl / mediaUrls` | `agent_end` Hook |
| 生成的文件 | `exec` 工具在工作区产出的文件 | `after_tool_call` Hook（监控 exec 工具） |
| 图像 | `image_generate` 工具输出 | `after_tool_call` Hook |
| Canvas UI | `canvas` 工具推送 | `after_tool_call` Hook |

### 7.2 产出收集实现

```typescript
function collectArtifacts(result: EmbeddedPiRunResult): ArtifactRecord[] {
  const artifacts: ArtifactRecord[] = [];

  for (const payload of result.payloads || []) {
    // 文本产出（长文本才归档，短回复不归档）
    if (payload.text && payload.text.length > 500) {
      artifacts.push({
        type: "document",
        content: payload.text,
        source: "agent_output",
      });
    }

    // 媒体产出
    if (payload.mediaUrl) {
      artifacts.push({
        type: "media",
        url: payload.mediaUrl,
        source: "agent_output",
      });
    }

    for (const url of payload.mediaUrls || []) {
      artifacts.push({
        type: "media",
        url,
        source: "agent_output",
      });
    }
  }

  return artifacts;
}
```

---

## 8. OpenClaw 配置扩展

### 8.1 用户如何启用 ClawTeams 插件

在 `openclaw.json` 中添加：

```json
{
  "clawteams": {
    "enabled": true,
    "serverUrl": "wss://api.clawteams.io/ws",
    "clawId": "claw_xxxxxxxx",
    "apiKey": "ct_xxxxxxxx",
    "reportToolCalls": true,
    "reportMessages": false,
    "artifactMinLength": 500
  }
}
```

### 8.2 插件安装方式

```bash
# 方式一：作为 OpenClaw 扩展安装
openclaw plugin install @clawteams/openclaw-plugin

# 方式二：手动放入 extensions 目录
cp -r clawteams-plugin/ ~/.openclaw/extensions/clawteams/
```

---

## 9. 阶段一开发任务（适配层部分）

### Sprint 1 中的适配层任务

| 任务 | 说明 | 产出 |
|------|------|------|
| A1-1 | 创建 OpenClaw Plugin 项目骨架 | `extensions/clawteams/` |
| A1-2 | 实现 ClawTeamsClient（WebSocket 客户端） | `clawteams-client.ts` |
| A1-3 | 实现 `gateway_start` Hook（龙虾注册） | `hooks/agent-lifecycle.ts` |
| A1-4 | 实现 `before_model_resolve` Hook（任务开始） | 同上 |
| A1-5 | 实现 `agent_end` Hook（任务完成 + 产出收集） | 同上 |
| A1-6 | 实现 `subagent_spawned/ended` Hook | `hooks/subagent-tracking.ts` |
| A1-7 | 实现心跳和断线重连 | `clawteams-client.ts` |
| A1-8 | 实现断线缓冲 | `state/task-buffer.ts` |
| A1-9 | 编写安装和配置文档 | `README.md` |
| A1-10 | 集成测试：Plugin + ClawTeams 后端 | `test/` |

### 后端需要配合的工作

| 任务 | 说明 |
|------|------|
| B1-1 | WebSocket 服务端支持 Plugin 发来的消息类型 |
| B1-2 | 注册接口：接收 Agent 列表，存入数据库 |
| B1-3 | 任务记录接口：接收 task_started/completed/failed |
| B1-4 | Subagent 关系记录：接收 subagent 事件，提取工作流边 |
| B1-5 | 产出归档：接收 artifact 数据，存入对象存储 |

---

## 10. 关键注意事项

### 10.1 性能

- Hook 执行是同步阻塞的，ClawTeams 上报必须是**异步非阻塞**（fire-and-forget）
- 工具调用追踪（P1）在高频场景下可能产生大量事件，需要考虑采样或节流
- 断线缓冲队列需要设置容量上限，避免内存泄漏

### 10.2 安全

- ClawTeams API Key 存储在 OpenClaw 配置中，需要安全保护
- Plugin 不应该修改 Agent 的执行行为（只观察，不干预）
- 上下文注入（`before_prompt_build`）需要谨慎，避免污染 Agent 原有行为

### 10.3 兼容性

- OpenClaw 版本更新可能影响 Hook API，Plugin 需要声明兼容版本
- Subagent 系统是 OpenClaw 的特色功能，其他龙虾平台可能没有
- claw-sdk（通用 SDK）和 OpenClaw Plugin 是**两个不同的东西**：
  - claw-sdk：通用的龙虾端 SDK，任何龙虾平台都能用
  - OpenClaw Plugin：专门为 OpenClaw 写的适配器，内部使用 claw-sdk 或直接实现协议

### 10.4 与 claw-sdk 的关系

```
方案 A：Plugin 内部使用 claw-sdk
  OpenClaw Plugin → 调用 claw-sdk → WebSocket → ClawTeams 后端

方案 B：Plugin 直接实现协议（推荐）
  OpenClaw Plugin → 直接 WebSocket → ClawTeams 后端
  claw-sdk 给其他龙虾平台用

推荐方案 B：
- OpenClaw Plugin 可以利用更多 OpenClaw 特有信息
- 避免 claw-sdk 的通用抽象损失细节
- claw-sdk 保持通用，给非 OpenClaw 龙虾使用
```

---

---

# Part II: OpenClaw 运行时深度分析

---

## 11. 启动流程（完整链路）

### 入口：`src/entry.ts`

```
src/entry.ts
  ├─ 环境初始化（进程标题、编译缓存、环境变量规范化）
  ├─ CLI 重生成检查（容器/版本）
  ├─ 版本快速路径（--version）
  └─ runMainOrRootHelp() → 异步导入 CLI 运行器
```

### Gateway 启动：`src/gateway/server.impl.ts`

```
startGatewayServer(port, options)
  ├─ 配置加载和验证（readConfigFileSnapshot + migrateLegacyConfig）
  ├─ 秘密系统初始化（activateRuntimeSecrets）
  ├─ 插件加载
  │   ├─ loadGatewayStartupPlugins() — 立即加载
  │   └─ reloadDeferredGatewayPlugins() — 延迟加载
  ├─ 全局 Hook 运行器初始化（initializeGlobalHookRunner）
  ├─ WebSocket 服务器启动
  ├─ 通道管理器创建
  ├─ 会话事件订阅者注册
  ├─ Subagent 注册表初始化
  ├─ Lane 并发控制设置（applyGatewayLaneConcurrency）
  ├─ Boot 脚本执行（runBootOnce → BOOT.md）
  └─ 侧车启动（Cron、发现、任务注册表维护）
```

**ClawTeams 适配意义**：`gateway_start` Hook 在这个流程的末尾触发，是注册龙虾的最佳时机。

### 插件加载时序

```
1. loadGatewayStartupPlugins()     — Gateway 启动前
2. initializeGlobalHookRunner()    — Hook 系统初始化
3. reloadDeferredGatewayPlugins()  — Gateway 启动后
4. ensureRuntimePluginsLoaded()    — Agent 执行前（按需）
```

ClawTeams Plugin 应在**阶段 1（启动时加载）**注册，确保所有 Hook 在第一个 Agent 执行前就位。

---

## 12. 消息处理完整链路

### 一条消息从接收到响应的完整路径

```
用户消息
  ↓
WebSocket 连接 (src/gateway/server/ws-connection.ts)
  ├─ JSON 解析 → 消息类型验证 → 原点检查
  ├─ 认证验证（签名校验 + 速率限制）
  └─ 预认证预算检查
  ↓
Gateway 方法路由 (src/gateway/server-methods/)
  └─ 匹配 "chat.send" 方法
  ↓
通道接收 (src/channels/)
  ├─ 消息规范化
  ├─ 命令门控 / 提及门控检查
  └─ 触发 onSessionTranscriptUpdate 事件
  ↓
命令队列入队 (src/process/command-queue.ts)
  ├─ 选择 Session Lane（每个会话独立 Lane）
  ├─ 入队到 QueueEntry
  └─ Lane 泵触发处理
  ↓
runEmbeddedPiAgent (src/agents/pi-embedded-runner/run.ts)
  ├─ 加载会话（JSONL 文件）
  ├─ 获取会话写锁
  ├─ Hook: before_model_resolve  ← 🎯 ClawTeams 捕获任务开始
  ├─ 模型和鉴权解析
  ├─ Hook: before_prompt_build   ← 🎯 ClawTeams 注入上下文
  └─ runEmbeddedAttempt 循环
      ├─ 构建消息载荷
      ├─ LLM 流式调用
      ├─ Tool Use 循环
      │   ├─ Hook: before_tool_call  ← 🎯 ClawTeams 记录工具调用
      │   ├─ 工具执行
      │   └─ Hook: after_tool_call   ← 🎯 ClawTeams 记录工具结果
      ├─ 压缩检查（超过 token 限制 → compact）
      └─ 持久化会话（写入 JSONL + 释放锁）
  ↓
  Hook: agent_end  ← 🎯 ClawTeams 捕获任务完成 + 产出
  ↓
响应流式传输
  ├─ chat.stream 事件（增量）
  ├─ chat.tool_use 事件
  └─ chat.end 事件
  ↓
任务系统更新 + 记忆系统刷新
```

### ClawTeams 的 6 个拦截点标记在链路中

上图中 🎯 标记的位置就是 ClawTeams Plugin 需要挂 Hook 的地方。

---

## 13. Agent 执行循环详解

### runEmbeddedPiAgent 核心流程

**文件**: `src/agents/pi-embedded-runner/run.ts`（1400+ 行）

```
runEmbeddedPiAgent(params)
  │
  ├─ 1. Lane 解析（行 100-105）
  │   ├─ 从 sessionKey 派生 Session Lane
  │   └─ 从 params.lane 派生 Global Lane
  │   → 两层入队保证会话级串行 + 全局级并发控制
  │
  ├─ 2. 工作空间解析（行 119-134）
  │   └─ 解析或继承工作空间目录
  │
  ├─ 3. 模型/Provider 解析（行 140-148）
  │   └─ 默认模型 → 配置覆盖 → Hook 覆盖
  │
  ├─ 4. 认证初始化（行 182-220）
  │   └─ 创建 Auth Controller，解析 profile 顺序
  │
  ├─ 5. 会话初始化（行 222-280）
  │   ├─ 加载 JSONL 会话历史
  │   └─ 压缩检查（token 超限 → 触发 compact）
  │
  └─ 6. 重试循环（行 282-540）
      │
      for (attempt = 0; attempt < maxRetry; attempt++) {
        │
        ├─ 运行 Attempt
        │   ├─ 构建消息载荷
        │   ├─ LLM 流式调用
        │   │
        │   ├─ Tool Use 循环
        │   │   while (hasToolUse) {
        │   │     extractToolUse(message)
        │   │     → executeTool(toolUse)  // 通过 Lane 入队
        │   │     → session.addToolResult()
        │   │     → model.complete() 继续
        │   │   }
        │   │
        │   └─ 返回 result
        │
        ├─ 成功 → 保存会话，返回
        │
        └─ 失败 → 故障分类
            ├─ isAuthError → 标记失败 profile，重试
            ├─ isRateLimit → 指数退避，重试
            ├─ isContextOverflow → 压缩会话，重试
            └─ 其他 → 最终失败
      }
```

### 重试策略

```
初始延迟: 100ms
最大延迟: 32s
增长因子: 2x
最大重试: 可配置（resolveMaxRunRetryIterations）
```

### 会话压缩触发

```
压缩触发条件:
  - 上下文 token 超过模型限制
  - 会话历史行数过大
  - 显式压缩请求

压缩流程 (src/agents/pi-embedded-runner/compact.ts):
  1. 获取会话写锁
  2. Hook: before_compaction
  3. 调用 compactWithSafetyTimeout()
  4. 截断过大的工具结果
  5. Hook: after_compaction
  6. 写入会话文件
  7. 释放写锁
```

---

## 14. Subagent 运行时行为

### 生成过程：`src/agents/subagent-spawn.ts`

**Subagent 参数**:
```typescript
{
  task: string;              // 子任务描述
  agentId?: string;          // 指定 Agent
  model?: string;            // 模型覆盖
  runTimeoutSeconds?: number; // 超时
  mode?: "run" | "session";  // 执行模式
  cleanup?: "delete" | "keep"; // 会话清理策略
  sandbox?: "inherit" | "require"; // 沙箱模式
  attachments?: Array<{name, content, encoding, mimeType}>;
}
```

**生成链路**:
```
父 Agent 调用 subagent.spawn 工具
  ├─ 能力检查（是否允许生成）
  ├─ 会话密钥生成（新的 childSessionKey）
  ├─ 工作空间继承（inherit 或 create）
  ├─ 模型选择（显式 或 继承父模型）
  ├─ 系统提示构建（Subagent 专属公告 + 任务描述）
  ├─ 附件物化（解码 Base64 → 写入子工作空间）
  ├─ Hook: subagent_spawning  ← 🎯 ClawTeams 记录
  ├─ 通过 Gateway API 调用 chat.send（创建子 Agent 运行）
  ├─ 注册到 Subagent 注册表
  └─ Hook: subagent_spawned   ← 🎯 ClawTeams 记录
```

### 子 Agent 结果回传

```
子 Agent 完成
  ├─ Hook: subagent_ended     ← 🎯 ClawTeams 记录
  ├─ 发出完成事件（AgentTaskCompletionInternalEvent）
  ├─ 父 Agent 通过会话订阅接收完成消息
  └─ 完成消息作为用户消息注入父 Agent 会话
```

### Subagent 与 ClawTeams 工作流的映射

```
Subagent 生成 = 工作流中的一条新边（父→子）
Subagent 完成 = 子节点状态更新
Subagent 超时/取消 = 子节点状态变为失败

ClawTeams 工作流图自动添加：
  [父 Agent 任务 node] ──spawned──→ [子 Agent 任务 node]
```

---

## 15. 任务系统运行时

### TaskRegistry：`src/tasks/task-registry.ts`（1400+ 行）

**数据结构**:
```typescript
type TaskRecord = {
  taskId: string;
  runtime: "subagent" | "acp" | "cli" | "cron";
  requesterSessionKey: string;
  childSessionKey?: string;
  parentTaskId?: string;
  agentId?: string;
  runId?: string;
  label?: string;
  task: string;
  status: TaskStatus;
  deliveryStatus: TaskDeliveryStatus;
  notifyPolicy: TaskNotifyPolicy;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  progressSummary?: string;
  terminalSummary?: string;
};

// 状态枚举
TaskStatus: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | "lost"
DeliveryStatus: "pending" | "delivered" | "session_queued" | "failed" | "parent_missing" | "not_applicable"
NotifyPolicy: "done_only" | "state_changes" | "silent"
```

**内存 + SQLite 双存储**:
```
Map<taskId, TaskRecord> (内存，快速查询)
  ↕ 同步
SQLite task-registry.store.sqlite (持久化)
```

**ClawTeams 适配意义**: TaskRegistry 是 OpenClaw 内部的任务追踪系统。ClawTeams 不直接读取它，而是通过 Hook 事件获取相同的信息。但了解它的状态机有助于正确映射任务状态。

### 任务状态转换图

```
queued → running → succeeded
                 → failed
                 → timed_out
                 → cancelled
       → lost（异常情况）
```

---

## 16. 进程和并发模型

### 单进程 + Lane 队列

OpenClaw 是**单进程应用**，并发通过 Node.js 事件循环 + Lane 队列实现。

**Lane 模型**:
```
Session Lane: 每个会话独立队列，并发=1（串行处理）
Global Lane:  全局共享队列，可配置并发
Cron Lane:    定时任务队列，并发=4
Subagent Lane: 子 Agent 队列
```

**泵机制**（command-queue.ts）:
```typescript
while (activeTaskIds.size < maxConcurrent && queue.length > 0) {
  entry = queue.shift();
  activeTaskIds.add(taskId);
  entry.task().then(result => {
    activeTaskIds.delete(taskId);
    pump(); // 递归处理下一个
    entry.resolve(result);
  });
}
```

**ClawTeams 适配意义**: Hook 执行也在这个事件循环中。ClawTeams Plugin 的 Hook 必须**快速返回**（异步 fire-and-forget），否则会阻塞 Agent 执行。

---

## 17. 持久化存储全景

### 存储层一览

| 存储 | 技术 | 内容 | 文件位置 |
|------|------|------|---------|
| 会话历史 | JSONL 文件 | 消息、工具调用、元数据 | `~/.openclaw/sessions/<agentId>/<sessionKey>.jsonl` |
| 任务注册表 | SQLite | 任务状态、通知、交付 | `~/.openclaw/task-registry.db` |
| 配置 | JSON/YAML | Agent、通道、模型、插件配置 | `~/.openclaw/openclaw.json` |
| 认证 | JSON | API Key、Profile | `~/.openclaw/auth-profiles.json` |
| 记忆 | LanceDB | 向量嵌入 + 元数据 | `~/.openclaw/memory/` |
| 锁 | 文件锁 | 会话写锁 | `<sessionFile>.lock` |

### 会话 JSONL 格式

```jsonl
{"sessionId":"uuid","updatedAt":1234567890,"spawnedBy":"parent-key","spawnDepth":0}
{"type":"message","role":"user","content":"帮我做市场调研"}
{"type":"message","role":"assistant","content":"好的，我来...","toolUse":[{"id":"tu_1","name":"web_search","input":{"query":"..."}}]}
{"type":"tool_result","toolUseId":"tu_1","content":"搜索结果..."}
{"type":"message","role":"assistant","content":"根据调研结果..."}
```

### 写锁机制

```
获取锁: fs.open(lockPath, "wx") — 独占创建
锁内容: { pid, createdAt, starttime }
锁验证: 检查 PID 是否活跃
过期: staleMs=30分钟 自动回收
重入: 同一进程可重入，计数器跟踪
Watchdog: 每 60 秒检查，释放超时锁
```

---

## 18. Hook 运行时行为

### 执行机制：`src/plugins/hook-runner-global.ts`

```typescript
// 初始化
initializeGlobalHookRunner(registry) {
  hookRunner = createHookRunner(registry, {
    logger,
    catchErrors: true  // 关键：单个 Hook 失败不破坏执行
  });
}

// 调用
const result = await hookRunner.runHook("before_model_resolve", event, context);
```

### Hook 调用时序（在 Agent 执行中）

```
runEmbeddedPiAgent()
  ├─ before_model_resolve ──── Hook #1（可覆盖 model/provider）
  ├─ before_prompt_build ───── Hook #2（可注入上下文）
  │
  └─ runEmbeddedAttempt()
      ├─ llm_input ─────────── Hook #3（LLM 调用前）
      ├─ before_tool_call ──── Hook #4（每次工具调用前）
      ├─ after_tool_call ───── Hook #5（每次工具调用后）
      ├─ llm_output ────────── Hook #6（LLM 响应后）
      └─ agent_end ─────────── Hook #7（Agent 执行完成）
```

### Hook 返回值影响

```typescript
// before_model_resolve 返回值
{ model?: string, provider?: string } // 覆盖模型选择

// before_prompt_build 返回值
{ prependContext?: string, appendSystemContext?: string } // 修改提示词

// before_tool_call 返回值
{ skip?: boolean, result?: unknown } // 跳过工具或替代结果

// agent_end 返回值
{} // 无返回值，仅用于记录和通知
```

### 错误处理

```
catchErrors: true 模式下：
  - Hook 抛出异常 → 记录警告 → 继续执行后续 Hook
  - 不影响 Agent 主流程
  - ClawTeams Plugin 的错误不会导致龙虾崩溃
```

---

## 19. ClawTeams 适配层性能指南

### 必须异步非阻塞

```typescript
// ❌ 错误：阻塞式上报
api.on("agent_end", async (event) => {
  await client.reportTaskCompleted(data);  // 等待网络往返
  return {};
});

// ✅ 正确：fire-and-forget
api.on("agent_end", async (event) => {
  client.reportTaskCompleted(data).catch(err => {
    buffer.push(data);  // 失败时缓冲
  });
  return {};  // 立即返回，不阻塞
});
```

### 工具调用追踪的节流

```typescript
// 高频工具调用时，采样上报
let toolCallCount = 0;
const SAMPLE_RATE = 5; // 每 5 次上报 1 次

api.on("before_tool_call", async (event) => {
  toolCallCount++;
  if (toolCallCount % SAMPLE_RATE === 0) {
    client.reportToolCall(data);
  }
  return {};
});
```

### 缓冲队列容量限制

```typescript
const MAX_BUFFER_SIZE = 1000;
const buffer: QueuedEvent[] = [];

function sendOrBuffer(msg: any) {
  if (ws.readyState === OPEN) {
    ws.send(JSON.stringify(msg));
  } else if (buffer.length < MAX_BUFFER_SIZE) {
    buffer.push(msg);
  } else {
    // 丢弃最旧的事件
    buffer.shift();
    buffer.push(msg);
  }
}
```

---

---

# Part III: 本地 OpenClaw 实例运行时分析

> 基于 `/Users/kermitshao/.openclaw/` 的实际运行数据

---

## 20. 实例概览

### 运行状态

```
进程: openclaw-gateway (PID 44807)
CPU: 10.8%  内存: 419MB
运行时长: 3+ 小时
监听端口: localhost:18789 (IPv4 + IPv6)
客户端: Chrome 浏览器通过 WebSocket 连接
```

### 业务场景：蝴蝶效应投资策略系统

这是一个**多 Agent 协作投资研究系统**，包含 1 个主 Agent + 6 个专业化 Agent：

| Agent ID | 角色 | Emoji | 模型 |
|---------|------|-------|------|
| main | 主助手 | - | - |
| butterfly-invest | 策略分析师 | 🦋 | gpt-5.4 |
| butterfly-invest-trigger | 信号侦察员 | ⚡ | gpt-5.4 |
| butterfly-invest-variable | 杠杆映射师 | 🧠 | gpt-5.4 |
| butterfly-invest-industry | 产业链解释员 | 🏭 | gpt-5.4 |
| butterfly-invest-asset | 资产制图师 | 🗺️ | gpt-5.4 |
| butterfly-invest-redteam | 内部反对者 | 🛡️ | gpt-5.4 |

**这正是 ClawTeams 的典型用户场景**：一个人管理多个专业化 Agent，需要透视它们的协作关系和工作状态。

---

## 21. 配置文件结构（真实数据）

### openclaw.json 关键结构

```json
{
  "version": "2026.3.28",
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": { "type": "token" }
  },
  "agents": {
    "main": { /* 主 Agent */ },
    "butterfly-invest": {
      "model": "openai/gpt-5.4",
      "workspacePath": "agents/butterfly-invest",
      "identity": { "subject": "策略分析师", "emoji": "🦋" }
    },
    "butterfly-invest-trigger": {
      "model": "openai/gpt-5.4",
      "workspacePath": "agents/butterfly-invest-trigger",
      "identity": { "subject": "信号侦察员", "emoji": "⚡" }
    }
    // ... 其他 Agent
  },
  "channels": {
    "whatsapp": { "enabled": true, "dmPolicy": "pairing" }
  },
  "plugins": {
    "whatsapp": { "installed": true }
  }
}
```

### ClawTeams 适配层可提取的信息

从 `openclaw.json` 中可以直接获取：
- **Agent 列表和 ID**（注册时上报）
- **Agent 角色描述**（identity.subject → 映射为 ClawTeams 的能力标签）
- **模型配置**（了解每个 Agent 的能力水平）
- **工作空间路径**（了解 Agent 的文件范围）
- **通道配置**（了解消息来源）

---

## 22. 会话文件格式（真实数据）

### JSONL 会话文件的实际格式

文件位置：`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`

**第 1 行：会话元数据**
```json
{
  "type": "session",
  "version": 3,
  "id": "32b64024-1558-46e5-bf1a-b565f61452cb",
  "timestamp": "2026-03-30T17:24:23.291Z",
  "cwd": "/Users/kermitshao/.openclaw/workspace"
}
```

**第 2 行：模型变更**
```json
{
  "type": "model_change",
  "id": "ea1939ea",
  "parentId": null,
  "timestamp": "2026-03-30T17:24:23.293Z",
  "provider": "openai",
  "modelId": "gpt-5.4"
}
```

**用户消息行**
```json
{
  "type": "message",
  "id": "65e56917",
  "parentId": "ea1939ea",
  "timestamp": "2026-03-30T17:24:23.293Z",
  "message": {
    "role": "user",
    "content": "用户输入文本..."
  }
}
```

**助手消息行（含工具调用）**
```json
{
  "type": "message",
  "id": "abc12345",
  "parentId": "65e56917",
  "timestamp": "2026-03-30T17:24:30.000Z",
  "message": {
    "role": "assistant",
    "content": "助手回复...",
    "toolCall": [
      {
        "id": "tu_1",
        "name": "web_search",
        "input": {"query": "..."}
      }
    ]
  },
  "usage": {
    "input": 1200,
    "output": 450,
    "cacheRead": 800,
    "total": 2450
  }
}
```

### ClawTeams 适配意义

会话 JSONL 文件是 OpenClaw 的**核心数据源**。ClawTeams 适配层有两种获取方式：
1. **Hook 实时拦截**（推荐）：通过 `agent_end` 等 Hook 获取实时数据
2. **文件读取**（补充）：需要历史回溯时直接解析 JSONL 文件

---

## 23. Agent 工作空间结构（真实数据）

### 主 Agent 工作空间文档体系

```
workspace/
├── AGENTS.md         — Agent 协作指南
├── BOOTSTRAP.md      — 启动配置
├── HEARTBEAT.md      — 心跳配置（定时任务）
├── IDENTITY.md       — 系统身份定义
├── SOUL.md           — 系统灵魂文档（核心行为规范）
├── TOOLS.md          — 工具使用说明
├── USER.md           — 用户信息模板
├── skills/           — 自定义技能
│   ├── self-improving-agent/
│   ├── x-research-skill/
│   └── website-monitor/
└── agents/           — 各 Agent 独立工作空间
    ├── butterfly-invest/        — 25 个文件
    │   ├── SOUL.md              — Agent 专属灵魂
    │   ├── IDENTITY.md          — Agent 身份
    │   ├── HEARTBEAT.md         — 心跳配置
    │   ├── 5代理闭环设计.md
    │   ├── 信息架构.md
    │   ├── 数据模型设计.md
    │   ├── Schema设计.md
    │   ├── MVP功能拆解.md
    │   └── ... (更多工作文档)
    ├── butterfly-invest-trigger/ — 11 个文件
    ├── butterfly-invest-variable/ — 11 个文件
    └── ... (其他 Agent)
```

### 数据资产

```
workspace/
├── investment_case_library_100.csv  — 100 个投资案例（蝴蝶效应分析框架）
└── butterfly-app/                    — 应用代码
```

### ClawTeams 适配意义

工作空间中的文件是 Agent 的**知识基础**和**工作产出**。ClawTeams 资产档案系统应该能：
- 索引这些文件作为 Agent 的知识资产
- 追踪文件变更（哪个 Agent 修改了什么）
- 将 Agent 产出的文档自动归档

---

## 24. 日志格式（真实数据）

### gateway.log 格式

```
2026-03-30T17:59:52.965-07:00 [agents/model-providers] [xai-auth] bootstrap config fallback
2026-03-30T18:01:39.099-07:00 [whatsapp] Auto-replied to +16693442870
2026-03-30T18:09:15.701-07:00 [whatsapp] Inbound message +16693442870 -> +16693442870 (direct, 140 chars)
```

格式：`{ISO时间戳} [{模块}] {消息}`

### 最近观察到的运行时行为

| 事件 | 频率 | 说明 |
|------|------|------|
| WhatsApp 消息收发 | 高频 | 主要交互通道 |
| Agent 执行 | 中频 | 多 Agent 协作 |
| 速率限制 | 偶发 | GPT-5.4 TPM 限制 500000 |
| 连接超时 | 偶发 | WhatsApp 499/503 |
| 配置变更 | 低频 | Agent 添加/修改 |

### ClawTeams 适配意义

日志提供了**运行时健康监控**数据。ClawTeams 可以：
- 解析日志了解 Agent 活跃度
- 检测错误模式（速率限制、连接问题）
- 但**不依赖日志**作为主要数据源（Hook 更可靠）

---

## 25. 存储系统全景（真实数据）

### 存储分布

| 存储位置 | 类型 | 大小 | 内容 |
|---------|------|------|------|
| `agents/*/sessions/*.jsonl` | JSONL | ~50KB/会话 | 完整对话历史 |
| `memory/main.sqlite` | SQLite | 69.6KB | 向量记忆 |
| `openclaw.json` | JSON | 4.9KB | 系统配置 |
| `workspace/agents/` | 文件目录 | 380KB | Agent 工作产出 |
| `workspace/skills/` | 文件目录 | 136KB | 自定义技能 |
| `logs/` | 文本日志 | ~70KB | 运行日志 |
| `credentials/` | JSON | 小 | 凭证存储 |

### 设备身份

```json
{
  "deviceId": "e7053ba26403a1062...",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----...",
  "createdAtMs": 1774838241050
}
```

已配对 3 个设备（1 个网关 + 2 个 Web UI）。

### ClawTeams 适配意义

- **deviceId** 可作为龙虾实例的唯一标识（或作为 claw_id 的候选）
- 配对设备列表可帮助 ClawTeams 了解龙虾的访问端点
- 会话文件大小提示 ClawTeams 需要考虑历史数据的存储策略

---

## 26. 适配层设计的实际约束（来自真实数据）

### 约束 1：Agent 数量和复杂度

当前实例有 7 个 Agent，6 个有独立工作空间。ClawTeams 工作流可视化需要能处理这种规模的 Agent 网络。

### 约束 2：通道多样性

当前通过 WhatsApp 交互。ClawTeams 的 `before_model_resolve` Hook 会收到 `messageChannel: "whatsapp"` 字段，需要正确处理。

### 约束 3：模型和速率限制

使用 GPT-5.4，偶尔触发速率限制。ClawTeams 适配层需要在 Hook 中处理这种情况（不要在速率限制时上报错误状态）。

### 约束 4：工作空间文件操作

Agent 会在工作空间中创建/修改大量文件（25+ 个）。ClawTeams 资产档案系统需要监控这些变更，但不能过于频繁（文件级变更远比任务级变更高频）。

### 约束 5：会话压缩

高频对话会触发会话压缩。ClawTeams 适配层需要在 `before_compaction`/`after_compaction` Hook 中正确处理，确保不丢失历史数据。

### 约束 6：实际的 Subagent 协作模式

当前配置中 6 个 Agent 各自独立运行，但通过主 Agent 编排。ClawTeams 需要能识别这种"主 Agent 调度子 Agent"的模式，并正确生成工作流图。

---

---

# Part IV: 适配层最终方案 — 双数据源架构

> 基于讨论确定的最终方案：文件 hash 追踪 + 轻量 Hook，均不干涉 OpenClaw 运行

---

## 27. 方案总览

### 两条并行数据流

```
┌───────────────────────────────────────────────────────────┐
│                    ClawTeams 后端                          │
│                                                           │
│  ┌─────────────────────┐   ┌──────────────────────────┐  │
│  │ 文件 Hash 追踪服务    │   │ Hook 事件接收服务         │  │
│  │ （Agent 定义和演化）  │   │ （运行时状态）            │  │
│  └─────────┬───────────┘   └─────────┬────────────────┘  │
│            │                         │                    │
│            └────────┬────────────────┘                    │
│                     ↓                                     │
│              统一状态存储                                   │
│              ↓        ↓                                   │
│         意图层/认知层  工作流层/执行层                      │
│              ↓        ↓                                   │
│              前端展示                                      │
└───────────────────────────────────────────────────────────┘

数据来源一：文件 Hash 追踪
  独立进程 → 只读扫描 ~/.openclaw/ → 零侵入

数据来源二：轻量 Hook
  OpenClaw Plugin → fire-and-forget → 零阻塞
```

### 两者的分工

| | 文件 Hash 追踪 | 轻量 Hook |
|---|---|---|
| 回答什么 | Agent **是什么、怎么变的** | Agent **此刻在干什么** |
| 数据频率 | 低频（文件变更时） | 中频（每次执行） |
| 侵入性 | 零（只读文件系统） | 极低（fire-and-forget） |
| 离线可用 | 是 | 否 |
| 对应层 | 意图层 + 认知层 | 工作流层 + 执行层 |

---

## 28. 数据源一：文件 Hash 追踪

### 追踪目标

每个 Agent 的核心定义文件：

| 文件 | 追踪内容 | 映射到 ClawTeams |
|------|---------|-----------------|
| `SOUL.md` | Agent 行为边界、核心规则 | 意图层：能力边界 |
| `IDENTITY.md` | Agent 角色定义 | 意图层：角色 |
| `AGENTS.md` | 协作关系、分工方式 | 工作流层：Agent 间的边 |
| `TOOLS.md` | 工具权限和使用规则 | 工作流层：节点能力 |
| `USER.md` | 服务对象描述 | 意图层：目标用户 |
| `HEARTBEAT.md` | 定时任务配置 | 工作流层：自动化节点 |
| `memory/*.sqlite` | 向量记忆 | 认知层：知识积累 |
| `openclaw.json` | 全局配置（Agent 列表、模型、通道） | 龙虾注册信息 |
| `sessions/*.jsonl` | 会话历史 | 执行层：任务历史 |
| 工作空间其他文件 | Agent 工作产出 | 资产档案层 |

### 追踪机制

```typescript
interface FileTracker {
  // 扫描配置
  scan_interval_ms: 10_000;   // 10 秒扫描一次
  openclaw_dir: string;       // ~/.openclaw/

  // 核心文件清单（每个 Agent）
  core_files: [
    "SOUL.md", "IDENTITY.md", "AGENTS.md",
    "TOOLS.md", "USER.md", "HEARTBEAT.md"
  ];

  // 追踪方法
  scan(): FileSnapshot[];           // 扫描所有文件，计算 hash
  diff(prev, curr): FileChange[];   // 比较两次快照，提取变更
  store(change: FileChange): void;  // 存储变更版本
}

interface FileSnapshot {
  file_path: string;
  hash: string;        // SHA-256
  size: number;
  modified_at: number; // 文件 mtime
  content?: string;    // 核心文件存内容，大文件只存 hash
}

interface FileChange {
  file_path: string;
  agent_id: string;        // 属于哪个 Agent
  change_type: "created" | "modified" | "deleted";
  prev_hash: string | null;
  curr_hash: string;
  prev_content?: string;
  curr_content?: string;
  diff?: string;           // 文本 diff
  timestamp: number;
  version: number;         // 递增版本号
}
```

### 扫描路径

```
~/.openclaw/
├── openclaw.json                          → 全局配置追踪
├── agents/
│   ├── main/sessions/*.jsonl              → 会话文件追踪
│   ├── butterfly-invest/sessions/*.jsonl
│   └── ...
├── workspace/
│   ├── AGENTS.md                          → 全局协作定义
│   ├── SOUL.md                            → 全局灵魂定义
│   ├── TOOLS.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── HEARTBEAT.md
│   └── agents/
│       ├── butterfly-invest/
│       │   ├── SOUL.md                    → Agent 专属灵魂
│       │   ├── IDENTITY.md               → Agent 专属身份
│       │   ├── HEARTBEAT.md              → Agent 专属定时任务
│       │   └── *.md (工作文档)            → Agent 产出
│       ├── butterfly-invest-trigger/
│       └── ...
└── memory/
    └── main.sqlite                        → 记忆数据库追踪
```

### 变更检测流程

```
每 10 秒：
  1. 遍历所有追踪路径
  2. 计算每个文件的 SHA-256 hash
  3. 与上一次快照对比
  4. hash 不同 → 读取新内容 → 生成 FileChange
  5. 存储 FileChange 到 ClawTeams 数据库
  6. 核心文件变更 → 触发前端推送（Agent 定义更新了）
  7. 会话文件变更 → 解析新增行 → 提取最新任务信息
```

### 版本存储

```
每个核心文件的版本链：
  butterfly-invest/SOUL.md
  ├── v1 (hash: abc123, 2026-03-28 14:00) — 初始版本
  ├── v2 (hash: def456, 2026-03-29 09:30) — 添加了风险控制规则
  ├── v3 (hash: ghi789, 2026-03-30 15:00) — 调整了分析框架
  └── current → v3

ClawTeams 可以展示：
  - 这个 Agent 的灵魂文件改了 3 次
  - 每次改了什么（diff）
  - 意图的演化轨迹
```

### 会话文件增量解析

会话 JSONL 文件是追加写入的，可以高效增量读取：

```typescript
interface SessionTracker {
  // 记录每个会话文件上次读取到的行号
  last_line: Map<string, number>;

  // 增量读取新行
  readNewLines(sessionFile: string): SessionEntry[];

  // 从新行中提取任务事件
  extractTasks(entries: SessionEntry[]): TaskEvent[];
}

// 从会话行中提取的任务事件
interface TaskEvent {
  agent_id: string;
  session_id: string;
  type: "user_message" | "assistant_response" | "tool_call" | "tool_result";
  timestamp: string;
  content_preview: string;  // 截取前 200 字
  has_tool_calls: boolean;
  tool_names?: string[];
  token_usage?: { input: number; output: number; total: number };
}
```

这样即使不用 Hook，也能从会话文件中获取 Agent 的执行历史。

---

## 29. 数据源二：轻量 Hook

### 极简 Hook 清单

只用**不阻塞执行流程**的 Hook，全部 fire-and-forget：

| Hook | 用途 | 阻塞风险 |
|------|------|---------|
| `gateway_start` | 上报龙虾上线 | 无（启动时一次） |
| `gateway_stop` | 上报龙虾离线 | 无（关闭时一次） |
| `agent_end` | Agent 完成一次执行 | 无（fire-and-forget） |
| `subagent_spawned` | 子 Agent 生成 | 无（fire-and-forget） |
| `subagent_ended` | 子 Agent 完成 | 无（fire-and-forget） |

**只有 5 个 Hook，全部 fire-and-forget。**

不使用的 Hook（避免性能风险）：
- ❌ `before_model_resolve` — 返回值会影响模型选择
- ❌ `before_prompt_build` — 返回值会修改提示词
- ❌ `before_tool_call` / `after_tool_call` — 高频，每次工具调用都触发
- ❌ `llm_input` / `llm_output` — 高频，每次 LLM 调用都触发

### Plugin 实现（极简版）

```typescript
// extensions/clawteams/src/index.ts

export default function clawteamsPlugin({ api, config }: PluginEntryParams) {
  const serverUrl = config.get("clawteams.serverUrl") as string;
  const clawId = config.get("clawteams.clawId") as string;

  // 轻量 WebSocket 客户端
  let ws: WebSocket | null = null;

  function send(data: any) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
    // 发不出去就丢弃，不缓冲（文件追踪是兜底）
  }

  // ── 龙虾上线 ──
  api.on("gateway_start", async () => {
    ws = new WebSocket(serverUrl);
    ws.on("open", () => {
      send({ type: "claw_online", claw_id: clawId, timestamp: Date.now() });
    });
    return {};
  });

  // ── 龙虾离线 ──
  api.on("gateway_stop", async () => {
    send({ type: "claw_offline", claw_id: clawId, timestamp: Date.now() });
    ws?.close();
    return {};
  });

  // ── Agent 完成执行（fire-and-forget）──
  api.on("agent_end", async (event) => {
    // 不 await，不阻塞
    send({
      type: "agent_execution",
      claw_id: clawId,
      agent_id: event.agentId,
      run_id: event.runId,
      duration_ms: event.meta?.durationMs,
      status: event.meta?.error ? "failed" : "completed",
      token_usage: event.meta?.agentMeta?.usage,
      has_tool_calls: (event.result?.payloads?.length ?? 0) > 0,
      timestamp: Date.now(),
    });
    return {};
  });

  // ── Subagent 生成 ──
  api.on("subagent_spawned", async (event) => {
    send({
      type: "subagent_spawned",
      claw_id: clawId,
      parent_key: event.requesterSessionKey,
      child_key: event.childSessionKey,
      task: event.task,
      timestamp: Date.now(),
    });
    return {};
  });

  // ── Subagent 完成 ──
  api.on("subagent_ended", async (event) => {
    send({
      type: "subagent_ended",
      claw_id: clawId,
      child_key: event.childSessionKey,
      outcome: event.outcome,
      timestamp: Date.now(),
    });
    return {};
  });
}
```

### 为什么不需要缓冲

文件 hash 追踪是**兜底数据源**。即使 Hook 发不出去（断网、服务端宕机），会话 JSONL 文件里的数据依然在。ClawTeams 可以在恢复后从文件追踪服务补全遗漏的数据。

```
Hook 数据：实时性高，但可能丢失
文件追踪：延迟 10 秒，但永不丢失
两者互补 → 完整覆盖
```

---

## 30. 两个数据源的汇合

### ClawTeams 后端如何合并数据

```
事件到达 → 去重（同一个 run_id 不重复记录）→ 统一存储

去重规则：
  - Hook 上报 agent_execution(run_id=xxx)
  - 文件追踪发现 session JSONL 新增了同一个 run_id 的记录
  → 只保留先到的，补充后到的额外字段
```

### 数据完整性矩阵

| 数据 | 文件追踪能提供 | Hook 能提供 | 合并后 |
|------|-------------|-----------|--------|
| Agent 列表 | ✅ openclaw.json | ✅ gateway_start | ✅ |
| Agent 角色/身份 | ✅ IDENTITY.md | ❌ | ✅ |
| Agent 行为定义 | ✅ SOUL.md | ❌ | ✅ |
| 协作关系 | ✅ AGENTS.md | ✅ subagent 事件 | ✅ |
| 定时任务 | ✅ HEARTBEAT.md | ❌ | ✅ |
| 工具能力 | ✅ TOOLS.md | ❌ | ✅ |
| 龙虾在线状态 | ❌ | ✅ gateway_start/stop | ✅ |
| Agent 实时执行状态 | ⚠️ 10秒延迟 | ✅ 实时 | ✅ |
| 执行历史 | ✅ session JSONL | ✅ agent_end | ✅ |
| Token 用量 | ✅ session JSONL | ✅ agent_end | ✅ |
| Subagent 协作 | ⚠️ 需推断 | ✅ subagent 事件 | ✅ |
| 定义文件演化 | ✅ 版本 diff | ❌ | ✅ |
| 记忆变化 | ✅ memory.sqlite | ❌ | ✅ |
| 工作产出 | ✅ 文件变更 | ❌ | ✅ |

**合并后无盲区。**

---

## 31. 开发任务更新（基于双数据源方案）

### Sprint 1 任务修订

| 原任务 | 修订为 | 说明 |
|-------|-------|------|
| S1-1 claw-sdk | S1-1 文件追踪服务 | 优先建设文件 hash 追踪 |
| S1-2 WebSocket 服务 | S1-2 保留 | Hook 数据接收 |
| S1-3 连接管理器 | S1-3 合并：文件追踪 + Hook 接收统一入口 | |
| S1-4 状态上报处理 | S1-4 双数据源合并和去重 | |
| S1-5 数据库建表 | S1-5 增加：文件版本表 | |
| 新增 | S1-6 OpenClaw Plugin（5 个 Hook） | 极简实现 |
| 新增 | S1-7 会话 JSONL 增量解析器 | 从文件提取任务历史 |

### 新增的数据库表

```sql
-- 文件版本追踪
file_versions (
  id SERIAL PRIMARY KEY,
  claw_id TEXT,
  agent_id TEXT,           -- 属于哪个 Agent（可为 null 表示全局）
  file_path TEXT,          -- 相对于 .openclaw/ 的路径
  file_type TEXT,          -- core_file | session | workspace | memory | config
  hash TEXT,               -- SHA-256
  content TEXT,            -- 核心文件存全文，大文件只存 hash
  diff_from_prev TEXT,     -- 与上一版本的 diff
  version INT,             -- 递增版本号
  created_at TIMESTAMPTZ
);

-- 文件扫描状态
file_scan_state (
  claw_id TEXT,
  file_path TEXT,
  last_hash TEXT,
  last_scanned_at TIMESTAMPTZ,
  last_line_read INT,      -- JSONL 文件的最后读取行号
  PRIMARY KEY (claw_id, file_path)
);
```

---

## 附录：OpenClaw 关键文件参考

| 文件 | 用途 | 适配层相关度 |
|------|------|------------|
| `src/agents/pi-embedded-runner/run.ts` | Agent 核心执行逻辑 | ⭐⭐⭐ |
| `src/agents/pi-embedded-runner/types.ts` | 运行结果结构 | ⭐⭐⭐ |
| `src/agents/pi-embedded-runner/run/params.ts` | 执行参数 | ⭐⭐⭐ |
| `src/plugins/types.ts` | 28 个 Hook 完整定义 | ⭐⭐⭐ |
| `src/plugin-sdk/plugin-entry.ts` | Plugin SDK 入口 | ⭐⭐⭐ |
| `src/tasks/task-registry.types.ts` | 任务类型定义 | ⭐⭐⭐ |
| `src/agents/subagent-registry.types.ts` | Subagent 类型 | ⭐⭐ |
| `src/agents/tools/common.ts` | 工具定义 | ⭐⭐ |
| `src/config/types.ts` | 配置架构 | ⭐⭐ |
| `src/gateway/events.ts` | Gateway WS 协议 | ⭐ |
