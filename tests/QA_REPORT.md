# ClawTeams QA 测试报告
日期：2026-03-29

## 环境状态
- npm install: **未执行**（Bash 权限受限，需手动运行 `npm install`）
- TypeScript 编译: **需手动验证**（`npx tsc --noEmit`）
- Jest 测试运行: **需手动验证**（`npm test`）
- 代码静态分析: 已完成（全量源码和测试代码审查）

> **注意**：本报告基于全量源码静态分析完成。编译和运行时结果需在手动执行 `npm install` 和 `npx tsc --noEmit` 后补充。

## 模块编译检查（静态分析）

| 模块 | 状态 | 预估错误数 | 关键问题 |
|------|------|-----------|---------|
| `src/infra/shared/` | 预期通过 | 0 | 纯类型定义，无外部依赖 |
| `src/infra/storage/` | 可能失败 | 1-2 | 依赖 `@aws-sdk/client-s3` 和 `@aws-sdk/s3-request-presigner`，未在 package.json 声明 |
| `src/infra/gateway/` | 可能失败 | 1-2 | 依赖 `fastify`、`@fastify/cors`，未在 package.json 声明 |
| `src/infra/db/` | 预期通过 | 0 | 仅导出路径常量 |
| `src/brain/account/` | 可能失败 | 1-2 | 依赖 `pg`、`neo4j-driver`，未在 package.json 声明 |
| `src/brain/intent/` | 可能失败 | 1 | 依赖 `neo4j-driver` |
| `src/brain/cognition/` | 可能失败 | 1 | 依赖 `neo4j-driver` |
| `src/brain/permission/` | 可能失败 | 1 | 依赖 `pg`、`neo4j-driver` |
| `src/brain/rollback/` | 可能失败 | 1 | 依赖 `pg`、`neo4j-driver` |
| `src/connector/eventbus/` | 预期通过 | 0 | 仅依赖 Node.js 内置模块和内部模块 |
| `src/connector/adapter/` | 预期通过 | 0 | 仅使用内部类型 |
| `src/connector/protocol/` | 可能失败 | 1 | 依赖 `ws` 未在 package.json 声明 |
| `src/connector/sync/` | 预期通过 | 0 | 仅依赖 Node.js 内置模块和内部模块 |
| `src/claw-sdk/` | 可能失败 | 1 | 依赖 `ws` 未在 package.json 声明 |

## 关键配置问题

### P0-CONFIG-1: package.json 缺少运行时依赖
**文件**: `/package.json`
**行**: 22-27 (devDependencies)

package.json 仅声明了 devDependencies (jest, typescript 等)，缺少以下生产依赖：

```
依赖                          使用位置
@aws-sdk/client-s3            src/infra/storage/storage-service.ts:6
@aws-sdk/s3-request-presigner src/infra/storage/presigned-url-service.ts:7
fastify                       src/infra/gateway/server.ts:5
@fastify/cors                 src/infra/gateway/server.ts:56
pg                            src/brain/account/user.service.ts:6 等多处
neo4j-driver                  src/brain/account/agent.service.ts:7 等多处
ws                            src/claw-sdk/client.ts:13, src/connector/protocol/
```

### P0-CONFIG-2: npm workspaces 子目录缺少 package.json
**文件**: `/package.json` 行 6-13

package.json 声明了 workspaces：
```json
"workspaces": ["src/infra", "src/brain", "src/workflow", "src/connector", "src/claw-sdk", "src/frontend"]
```
但除了 `src/frontend/` 之外，其他目录都没有自己的 `package.json`。这会导致 `npm install` 在 workspace 模式下失败。

**建议修复**：
- 方案 A：移除 workspaces 声明，改为单体 monorepo 结构
- 方案 B：为每个子目录创建 package.json

### P0-CONFIG-3: 测试框架不一致 — Jest vs Vitest
**影响文件**：

| 测试文件 | 使用框架 | 导入语句 |
|---------|---------|---------|
| `tests/brain/**/*.test.ts` | Jest（全局） | 无显式导入，使用 `jest.fn()` |
| `tests/connector/eventbus.test.ts` | Vitest | `import { describe, it, expect, beforeEach } from 'vitest'` |
| `tests/connector/adapter.test.ts` | Vitest | `import { describe, it, expect, beforeEach, vi } from 'vitest'` |
| `tests/connector/sync.test.ts` | Vitest | `import { describe, it, expect, beforeEach } from 'vitest'` |
| `tests/connector/utils.test.ts` | Vitest | `import { describe, it, expect } from 'vitest'` |
| `tests/connector/protocol.test.ts` | Vitest | `import { describe, it, expect, beforeEach, vi } from 'vitest'` |

jest.config.ts 配置的是 `ts-jest` 预设，但 connector 测试使用 Vitest API (`vi.fn()` 而非 `jest.fn()`)。这意味着：
- Brain 测试在 Jest 下可以运行
- Connector 测试在 Jest 下**会编译失败**（`vitest` 模块不存在）

**修复建议**：统一为 Jest 或在 connector 测试中替换 `vi` 为 `jest`，移除 vitest 导入。

## 单元测试结果（预期）

> 以下基于静态代码分析预估。实际运行需先解决 P0 配置问题。

### Brain 模块测试

| 测试文件 | 预期结果 | 说明 |
|---------|---------|------|
| `tests/brain/account/user.service.test.ts` | 通过 | Mock 完整，覆盖 register/login/getById/update/deactivate |
| `tests/brain/account/agent.service.test.ts` | 通过 | Mock 完整，覆盖 create/getById/transferOwnership/handleUserDeparture/updateCapabilities |
| `tests/brain/intent/graph.service.test.ts` | 通过 | Mock 完整，覆盖 createGoal/updateGoal/deleteGoal/listGoals/createEdge |
| `tests/brain/intent/alignment.service.test.ts` | 通过 | Mock 完整，覆盖 aligned/orphan/stale/batchCheck/impact |
| `tests/brain/cognition/cognition.service.test.ts` | 通过 | Mock 完整，覆盖 deviation/repeatedFailures/veto/updateStage/evolutionChain |
| `tests/brain/permission/permission.service.test.ts` | 通过 | Mock 完整，覆盖 role-based/deny/layer-lock/derive/createBinding |
| `tests/brain/rollback/rollback.service.test.ts` | 通过 | Mock 完整，覆盖 single-agent/team/available-versions |

### Connector 模块测试

| 测试文件 | 预期结果 | 说明 |
|---------|---------|------|
| `tests/connector/eventbus.test.ts` | **失败** | 使用 Vitest 导入，Jest 下无法运行 |
| `tests/connector/adapter.test.ts` | **失败** | 使用 Vitest 导入 (`vi.fn()`)，Jest 下无法运行 |
| `tests/connector/sync.test.ts` | **失败** | 使用 Vitest 导入，Jest 下无法运行 |
| `tests/connector/utils.test.ts` | **失败** | 使用 Vitest 导入，Jest 下无法运行 |
| `tests/connector/protocol.test.ts` | **失败** | 使用 Vitest 导入 (`vi.fn()`)，Jest 下无法运行 |

## 发现的问题清单

### P0 — 编译错误（阻塞）

| ID | 文件 | 行号 | 描述 |
|---|------|------|------|
| P0-1 | `package.json` | 22-27 | 缺少运行时依赖声明（@aws-sdk, fastify, pg, neo4j-driver, ws 等） |
| P0-2 | `package.json` | 6-13 | workspaces 配置但子目录缺少 package.json，npm install 会失败 |
| P0-3 | `tests/connector/*.test.ts` | 1 | 所有 connector 测试使用 `import from 'vitest'`，但项目配置为 Jest |
| P0-4 | `src/infra/gateway/server.ts` | 56 | `await app.register(import('@fastify/cors'), ...)` — 动态导入需要 `@fastify/cors` 包 |
| P0-5 | `src/infra/gateway/api-key-auth.ts` | 121 | 模块顶层 `setInterval(cleanupCache, CACHE_TTL_MS)` 会在导入时立即执行，影响测试环境 |

### P1 — 测试失败（功能缺陷）

| ID | 文件 | 行号 | 描述 |
|---|------|------|------|
| P1-1 | `tests/connector/eventbus.test.ts` | 1 | `import { describe, it, expect } from 'vitest'` — 在 Jest 环境下找不到 vitest 模块 |
| P1-2 | `tests/connector/adapter.test.ts` | 1 | 同上，且使用 `vi.fn()` 而非 `jest.fn()` |
| P1-3 | `tests/connector/sync.test.ts` | 1 | 同上 |
| P1-4 | `tests/connector/utils.test.ts` | 1 | 同上 |
| P1-5 | `tests/connector/protocol.test.ts` | 1 | 同上，且使用 `vi.fn()` 而非 `jest.fn()` |
| P1-6 | `tests/brain/permission/permission.service.test.ts` | 171 | `expect(derived.lower_layer_permissions[0].actions).toContain('admin' as any)` — 实际代码推导出的 actions 不含 'admin'，而是完整列表 `['create','read','update','delete','execute','assign']`，此断言可能失败 |

### P2 — 类型不一致（接口问题）

| ID | 文件 | 行号 | 描述 |
|---|------|------|------|
| P2-1 | `src/brain/intent/graph.service.ts` | 22-30 | Brain 的 `CreateGoalRequest` 包含 `layer` 和 `parent_id` 字段，但 `contracts/brain-api.yaml` 的 `CreateGoalRequest` 不包含这两个字段。API 契约与实现不一致。 |
| P2-2 | `src/claw-sdk/types.ts` | 全文件 | SDK 重新定义了 `MessageFrame`、`AgentCapability`、`AgentRuntime`、`AgentHeartbeatStatus`、`AgentResourceUsage` 等类型，与 `src/infra/shared/` 和 `src/connector/types.ts` 中的定义重复。如果任一处修改，SDK 可能不同步。 |
| P2-3 | `src/claw-sdk/types.ts` | 63-76 | SDK 的事件类型命名为 `ClawEvent`，而 infra 共享类型命名为 `ClawTeamsEvent`。结构相同但名称不同，使用时容易混淆。 |
| P2-4 | `src/claw-sdk/types.ts` | 8-14 | SDK 的 `MessageFrame.msg_type` 为 `string`，而 connector 的 `MessageFrame.msg_type` 为严格的 `MessageType` 联合类型。类型安全性降级。 |
| P2-5 | `contracts/brain-api.yaml` | 402-407 | API 契约的 `GraphEdge.edge_type` 只列出 5 种（DEPENDS_ON, PARALLEL_WITH, CONDITION, AGGREGATES, LOOP_BACK），而共享类型 `IntentEdgeType` 有 10 种。契约未覆盖内部使用的边类型。 |
| P2-6 | `src/brain/intent/graph.service.ts` | 216 | `createEdge` 方法通过字符串拼接构建 Cypher 查询：`` `CREATE (a)-[r:${req.edge_type} ...` ``。存在 Cypher 注入风险（虽然 edge_type 有类型约束，但运行时无校验）。 |
| P2-7 | `src/brain/account/team.service.ts` | 9-17 | Brain 的 `Team` 类型使用 `id` 字段，而 `contracts/brain-api.yaml` 的 `Team` 使用 `team_id` 字段。字段命名不一致。 |
| P2-8 | `src/brain/intent/knowledge.service.ts` | 13-22 | Brain 的 `KnowledgeNode` 使用 `node_id`，与 `contracts/brain-api.yaml` 一致，但 `CognitionRecord` 使用 `cognition_id`。节点 ID 命名风格不统一。 |

### P3 — 代码质量（建议改进）

| ID | 文件 | 行号 | 描述 |
|---|------|------|------|
| P3-1 | `src/infra/gateway/jwt-auth.ts` | 7 | `createVerify` 从 `crypto` 导入但未使用（dead import）。实际使用的是 `createHmac`（通过 require 导入）。 |
| P3-2 | `src/infra/gateway/jwt-auth.ts` | 47,108 | `createHmac` 使用 `require('crypto')` 动态导入而非顶层 import。在 ESM 模式下可能有兼容性问题。 |
| P3-3 | `src/infra/gateway/api-key-auth.ts` | 121 | 模块级 `setInterval(cleanupCache, CACHE_TTL_MS)` — 导入此模块就会启动定时器，在测试环境下可能导致 Jest 无法正常退出（open handles）。 |
| P3-4 | `src/infra/gateway/server.ts` | 121-132 | 全局错误处理器中 `error as { statusCode?: number }` 类型断言重复执行了两次（行 121 和行内）。 |
| P3-5 | `src/brain/account/user.service.ts` | 155 | SQL 字符串拼接 `` `INTERVAL '${this.refreshTokenTtl} seconds'` `` — 虽然 `refreshTokenTtl` 是数字类型不会导致注入，但不符合参数化查询最佳实践。 |
| P3-6 | `src/brain/intent/graph.service.ts` | 216,247 | `createEdge` 和 `deleteEdge` 直接将 `edge_type` 拼接到 Cypher 查询字符串中。应使用参数化查询或白名单校验。 |
| P3-7 | `src/brain/permission/permission.service.ts` | 163 | `derivePermissions` 方法中使用模板字符串拼接 Neo4j label：`` `MATCH (s:${label} {id: $id})` ``。应使用参数化或白名单校验。 |
| P3-8 | `src/connector/eventbus/event-bus.ts` | 全文件 | `EventBusImpl.subscribe` 方法签名增加了可选的 `teamId` 参数，但 `EventBus` 接口（infra/shared/events.ts 行 115-118）不包含此参数。实现不完全符合接口。 |
| P3-9 | `src/claw-sdk/client.ts` | 133,253 | 多处使用 `as any` 类型断言绕过类型检查（行 133, 253, 344, 371）。 |
| P3-10 | `src/brain/cognition/cognition.service.ts` | 218-222 | `updateStage` 方法的 Cypher 使用条件字符串拼接：`` `${stage === 'validated' ? ', c.verified = true' : ''}` ``。虽然 stage 有类型约束，但拼接 Cypher 不是最佳实践。 |
| P3-11 | 多个测试文件 | - | Brain 测试缺少 `login` 正常流程测试（只测了失败路径），缺少 `refreshAccessToken` 测试，缺少 `logout` 测试。 |
| P3-12 | - | - | 无 integration 测试实现（`tests/integration/*.test.ts` 存在但未审查是否有实质内容）。 |

## 新增测试文件清单

本次 QA 新增以下测试文件到 `tests/infra/` 目录：

| 文件 | 覆盖范围 |
|------|---------|
| `tests/infra/shared-types.test.ts` | 共享类型完整性测试 — 验证所有类型可正确导入和使用，覆盖 events / agent-identity / intent-graph / artifact / cognition / permissions / task-input |
| `tests/infra/storage-service.test.ts` | 存储服务接口测试 — 验证 IStorageService 和 IPresignedUrlService 接口完整性，参数和返回值类型 |
| `tests/infra/jwt-auth.test.ts` | JWT/API Key 鉴权中间件测试 — 验证 signJwt/verifyJwt 往返、过期检测、签名篡改检测、API Key 生成/哈希/前缀提取 |
| `tests/infra/gateway.test.ts` | 网关路由注册测试 — 验证所有导出函数和类型、GatewayConfig/AuthContext 类型完整性、hook 工厂函数 |
| `tests/infra/cross-module-consistency.test.ts` | 跨模块一致性测试 — Brain service 方法 vs brain-api.yaml 契约、事件结构 vs event-schema.yaml、共享类型一致引用检查、SDK 类型重复检测 |

## 每个模块的修复建议

### Infra 需要修复
1. **[P0-1] 添加运行时依赖** — 在 `package.json` 中添加 dependencies：
   ```json
   "dependencies": {
     "@aws-sdk/client-s3": "^3.500.0",
     "@aws-sdk/s3-request-presigner": "^3.500.0",
     "fastify": "^4.25.0",
     "@fastify/cors": "^9.0.0",
     "pg": "^8.12.0",
     "neo4j-driver": "^5.20.0",
     "ws": "^8.16.0"
   }
   ```
2. **[P0-2] 修复 workspaces 配置** — 移除 `"workspaces"` 字段，或为每个子目录创建 `package.json`
3. **[P3-1] 移除 jwt-auth.ts 中未使用的 `createVerify` 导入**（行 7）
4. **[P3-2] 将 jwt-auth.ts 中的 `require('crypto')` 改为顶层 `import { createHmac } from 'crypto'`**
5. **[P3-3] 将 api-key-auth.ts 中的顶层 `setInterval` 改为惰性初始化**，或提供 `cleanup()` 方法供测试调用
6. **[P3-4] 修复 server.ts 错误处理器中的重复类型断言**

### Brain 需要修复
1. **[P2-1] 同步 `CreateGoalRequest`** — 在 `brain-api.yaml` 中添加 `layer` 和 `parent_id` 字段，或在 API 层做映射
2. **[P2-7] 统一 Team ID 字段命名** — 选择 `id` 或 `team_id` 并在 API 层统一
3. **[P3-5] 使用参数化查询替代 SQL 字符串拼接**（user.service.ts 行 155）
4. **[P3-6] 在 graph.service.ts 的 `createEdge`/`deleteEdge` 中添加 edge_type 白名单校验**
5. **[P3-7] 在 permission.service.ts 的 `derivePermissions` 中避免直接拼接 Neo4j label**
6. **[P3-11] 补充 UserService 的 login 正常流程、refreshAccessToken、logout 测试用例**

### Connector 需要修复
1. **[P0-3/P1-1~P1-5] 统一测试框架** — 将所有 connector 测试从 Vitest 迁移到 Jest：
   - 移除 `import { describe, it, expect, ... } from 'vitest'`
   - 将 `vi.fn()` 替换为 `jest.fn()`
   - 将 `vi.fn().mockResolvedValue()` 替换为 `jest.fn().mockResolvedValue()`
2. **[P3-8] 修复 EventBusImpl.subscribe 签名与接口不一致** — 在 `EventBus` 接口中添加可选的 `teamId` 参数，或在 EventBusImpl 中将其设为可选的第三参数

### Claw-SDK 需要修复
1. **[P2-2] 考虑从 `@infra/shared` 导入共享类型** — 或建立类型同步机制确保 SDK 类型与核心类型保持一致
2. **[P2-3] 统一事件类型命名** — `ClawEvent` -> `ClawTeamsEvent`，或在 SDK 中 re-export 并别名
3. **[P2-4] 将 SDK MessageFrame.msg_type 收紧为联合类型**
4. **[P3-9] 减少 `as any` 使用** — 定义准确的 payload 类型

## 测试覆盖率概览

| 模块 | 已有测试 | 新增测试 | 覆盖的 Service/组件 | 未覆盖 |
|------|---------|---------|-------------------|--------|
| Infra shared | 0 | 1 | 所有共享类型 | - |
| Infra storage | 0 | 1 | 接口完整性 | 实际 S3 操作（需 mock） |
| Infra gateway | 0 | 2 | JWT/API Key/路由导出 | createGateway 实际路由 |
| Infra cross-module | 0 | 1 | API 契约一致性 | - |
| Brain account | 2 | 0 | UserService, AgentService | TeamService（无测试） |
| Brain intent | 2 | 0 | IntentGraphService, AlignmentService | TimelineService, KnowledgeService |
| Brain cognition | 1 | 0 | CognitionService | - |
| Brain permission | 1 | 0 | PermissionService | PermissionMiddleware |
| Brain rollback | 1 | 0 | RollbackService | - |
| Connector eventbus | 1 | 0 | EventBusImpl, InMemoryEventStore | (**需迁移到 Jest**) |
| Connector adapter | 1 | 0 | OutputHook, ContextInjector, EventSubscriber | (**需迁移到 Jest**) |
| Connector protocol | 1 | 0 | ConnectionManager | WsServer |
| Connector sync | 1 | 0 | OfflineQueue, AgentStateTracker | SyncManager |
| Connector utils | 1 | 0 | 工具函数 | (**需迁移到 Jest**) |
| Claw-SDK | 0 | 0 | - | ClawClient（无测试） |

## 总结

### 阻塞问题（必须修复才能编译和运行测试）
1. `package.json` 缺少所有运行时依赖
2. workspaces 配置不完整
3. Connector 测试使用 Vitest 而非 Jest

### 高优先级
4. Brain API 契约与实现不一致（CreateGoalRequest 差异）
5. SDK 类型重复定义，存在不同步风险

### 中优先级
6. Cypher/SQL 查询中的字符串拼接安全隐患
7. 模块顶层副作用（setInterval）影响测试
8. 未使用的导入和重复的类型断言
