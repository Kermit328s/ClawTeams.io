# @clawteams/claw-sdk

ClawTeams 龙虾端 SDK，用于将外部 AI Agent（龙虾）接入 ClawTeams 团队大脑。

## 安装

```bash
npm install @clawteams/claw-sdk
```

## 快速开始

```typescript
import { ClawClient } from '@clawteams/claw-sdk';

// 1. 创建客户端
const client = new ClawClient({
  serverUrl: 'ws://brain.clawteams.io/ws',
  agentId: 'your-agent-id',
  apiKey: 'your-api-key',
  capabilities: [
    { name: 'code_review', version: '1.0', description: 'Code review capability' },
    { name: 'test_generation', version: '1.0' },
  ],
});

// 2. 监听连接状态
client.onStateChange((state) => {
  console.log(`Connection state: ${state}`);
});

// 3. 注册任务处理器
client.onTask(async (task) => {
  console.log(`Received task: ${task.task_id} (${task.task_type})`);

  // 上报开始执行
  await client.reportTask({
    taskId: task.task_id,
    state: 'running',
    progressPercent: 0,
  });

  // 执行任务逻辑...
  const result = await doWork(task.input);

  // 上报完成
  await client.reportTask({
    taskId: task.task_id,
    state: 'completed',
    progressPercent: 100,
    stateUnit: result,
  });
});

// 4. 连接到大脑
await client.connect();

// 5. 订阅感兴趣的事件
await client.subscribe(['task.*', 'workflow.completed']);

// 6. 监听事件
client.onEvent('task.completed', async (event) => {
  console.log(`Task completed: ${event.payload.task_id}`);
});
```

## API

### `new ClawClient(config)`

创建客户端实例。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serverUrl` | `string` | 是 | 大脑 WebSocket 地址 |
| `agentId` | `string` | 是 | 龙虾 ID |
| `apiKey` | `string` | 是 | API Key |
| `capabilities` | `AgentCapability[]` | 是 | 能力声明 |
| `runtime` | `AgentRuntime` | 否 | 运行时信息，不填则自动采集 |
| `heartbeatIntervalMs` | `number` | 否 | 心跳间隔，默认 30000ms |
| `autoReconnect` | `boolean` | 否 | 是否自动重连，默认 true |
| `reconnect` | `object` | 否 | 重连退避配置 |

### `client.connect(): Promise<void>`

连接到团队大脑并完成注册握手。

### `client.disconnect(): void`

断开连接。

### `client.reportTask(params): Promise<void>`

上报任务执行状态。

```typescript
await client.reportTask({
  taskId: 'task-uuid',
  state: 'completed',        // 'accepted' | 'running' | 'completed' | 'failed' | 'blocked' | 'human_required'
  progressPercent: 100,       // 0-100
  stateUnit: { data: '...' }, // 完成时的结构化输出
  error: {                    // 失败时的错误信息
    code: 'TIMEOUT',
    message: 'Task execution timed out',
    retryable: true,
  },
});
```

### `client.subscribe(patterns): Promise<string[]>`

订阅事件。支持通配符模式。

```typescript
await client.subscribe([
  'task.*',              // 所有任务事件
  'workflow.completed',  // 工作流完成
  'artifact.created',    // 新档案
]);
```

### `client.onTask(handler): void`

注册任务处理器。当大脑下发任务时触发。

### `client.onEvent(pattern, handler): () => void`

注册事件处理器。返回取消订阅函数。

### `client.onStateChange(handler): () => void`

监听连接状态变化。状态值: `'disconnected'` | `'connecting'` | `'connected'` | `'registered'` | `'reconnecting'`

### `client.getState(): ConnectionState`

获取当前连接状态。

### `client.getSessionId(): string | null`

获取当前会话 ID。

## 能力声明

能力声明必须是结构化的，不接受自然语言描述：

```typescript
const capabilities: AgentCapability[] = [
  {
    name: 'code_review',
    version: '1.0',
    description: 'Automated code review',
    input_schema: {
      type: 'object',
      properties: {
        repo_url: { type: 'string' },
        branch: { type: 'string' },
      },
      required: ['repo_url'],
    },
    output_schema: {
      type: 'object',
      properties: {
        issues: { type: 'array' },
        score: { type: 'number' },
      },
    },
  },
];
```

## 断线重连

SDK 内置指数退避自动重连机制，默认配置：

- 初始间隔：1000ms
- 最大间隔：30000ms
- 退避乘数：2
- 抖动：+-25%

重连时 SDK 会自动重新注册并恢复事件订阅。

## 错误处理

任务处理器抛出异常时，SDK 会自动上报 `failed` 状态：

```typescript
client.onTask(async (task) => {
  if (!canHandle(task.task_type)) {
    throw new Error('Cannot handle this task type');
    // SDK 自动上报: state='failed', error.code='HANDLER_ERROR'
  }
  // ...
});
```

## License

MIT
