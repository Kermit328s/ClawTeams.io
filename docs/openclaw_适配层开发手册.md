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
