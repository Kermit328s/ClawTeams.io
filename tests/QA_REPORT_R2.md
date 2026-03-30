# ClawTeams QA 第二轮测试报告

日期：2026-03-29

## 第一轮修复验证

| 问题ID | 修复状态 | 说明 |
|--------|---------|------|
| P0-1 | ✅ 已修复 | `package.json` 已添加 dependencies: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, fastify, @fastify/cors, pg, neo4j-driver, ws |
| P0-2 | ✅ 已修复 | `package.json` 已移除 `workspaces` 字段，改为单体结构 |
| P0-3 | ✅ 已修复 | 5 个 connector 测试文件已全部移除 `import from 'vitest'`，`vi.fn()` 已替换为 `jest.fn()` |
| P0-4 | ✅ 已修复 | `@fastify/cors` 已添加到 dependencies，动态导入可正常解析 |
| P0-5 | ✅ 已修复 | `api-key-auth.ts` 改为惰性初始化：`startCacheCleanup()` / `stopCacheCleanup()` 函数，不再有模块顶层 setInterval |
| P1-1 | ✅ 已修复 | 随 P0-3 一并修复 |
| P1-2 | ✅ 已修复 | 随 P0-3 一并修复 |
| P1-3 | ✅ 已修复 | 随 P0-3 一并修复 |
| P1-4 | ✅ 已修复 | 随 P0-3 一并修复 |
| P1-5 | ✅ 已修复 | 随 P0-3 一并修复 |
| P1-6 | ⚠️ 未验证 | 需运行时确认 `derivePermissions` 实际返回值，静态分析无法判定 |
| P2-1 | ⚠️ 未修复 | `CreateGoalRequest`（graph.service.ts）仍包含 `layer` 和 `parent_id` 字段，`brain-api.yaml` 未同步。属于已知设计差异，暂可接受 |
| P2-2 | ⚠️ 未修复 | SDK 仍重新定义类型，与 infra/shared 存在重复。属于架构技术债 |
| P2-3 | ⚠️ 未修复 | SDK `ClawEvent` vs infra `ClawTeamsEvent` 命名差异仍存在 |
| P2-4 | ⚠️ 未修复 | SDK `MessageFrame.msg_type` 仍为 `string`，未收紧为联合类型 |
| P2-5 | ⚠️ 未修复 | `brain-api.yaml` 的 edge_type 仍只列 5 种，与代码中 10 种不一致 |
| P2-6 | ✅ 已修复 | `graph.service.ts` 的 `createEdge` 和 `deleteEdge` 现在调用 `validateEdgeType()` 白名单校验后再拼接 |
| P2-7 | ✅ 已修复 | `team.service.ts` 的 Team 接口已使用 `team_id` 字段，与 API 契约一致 |
| P2-8 | — | 非缺陷，仅风格不统一，无需修复 |
| P3-1 | ✅ 已修复 | `jwt-auth.ts` 已移除未使用的 `createVerify` 导入 |
| P3-2 | ✅ 已修复 | `jwt-auth.ts` 已改为顶层 `import { createHmac } from 'crypto'`，不再使用 `require('crypto')` |
| P3-3 | ✅ 已修复 | 随 P0-5 一并修复（惰性初始化） |
| P3-4 | ✅ 已修复 | `server.ts` 错误处理器已简化为 `error: Error & { statusCode?: number }` 单次断言 |
| P3-5 | ✅ 已修复 | `user.service.ts` 行 155 改为 `make_interval(secs => $3)` 参数化查询 |
| P3-6 | ✅ 已修复 | `graph.service.ts` 添加了 `ALLOWED_EDGE_TYPES` 白名单和 `validateEdgeType()` 函数 |
| P3-7 | ✅ 已修复 | `permission.service.ts` 添加了 `ALLOWED_NEO4J_LABELS` 白名单和 `validateNeo4jLabel()` 函数 |
| P3-8 | ✅ 已修复 | `EventBusImpl` 使用 TypeScript 方法重载，基础签名匹配 `EventBus` 接口，扩展签名添加可选 `teamId` |
| P3-9 | ⚠️ 未修复 | SDK 中 `as any` 仍存在，属于技术债 |
| P3-10 | ⚠️ 未修复 | `cognition.service.ts` 行 218 仍使用模板字符串拼接 Cypher SET 子句。`stage` 有类型约束，风险较低 |
| P3-11 | ⚠️ 未修复 | Brain 测试仍缺少 login 正常流程、refreshAccessToken、logout 测试 |
| P3-12 | ⚠️ 未修复 | 集成测试仍未实现 |

## 编译结果

- npm install: **未执行**（Bash 权限受限，需手动运行 `npm install`）
- tsc --noEmit: **需手动验证**（`npx tsc --noEmit`）
- jest: **需手动验证**（`npx jest --passWithNoTests`）

> **注意**：以下基于静态分析预估。

### 预估 tsc 编译结果

根目录 `tsconfig.json` 包含 `src/**/*.ts` 和 `tests/**/*.ts`，但**不包含 `.tsx`** 文件（未配置 `jsx` 编译选项）。

- **后端 src + tests**：预期通过（所有依赖已在 package.json 声明，路径别名 `@infra/*`、`@shared/*` 等已配置）
- **前端 src/frontend/**：前端有独立 `tsconfig.json`（含 jsx: react-jsx），走 Vite 构建，不受根 tsconfig 影响

### 预估 jest 测试结果

- **Brain 模块测试**（7 个文件）：预期全部通过
- **Connector 模块测试**（5 个文件）：预期全部通过（已迁移到 Jest）
- **Infra 模块测试**（5 个文件）：预期全部通过
- **Workflow 模块测试**（5 个文件）：预期全部通过
- **总计**：22 个测试文件，预期全部通过

## 新发现的问题

### P0

无新增 P0 问题。

### P1

无新增 P1 问题。

### P2

| ID | 文件 | 描述 |
|----|------|------|
| P2-NEW-1 | `src/frontend/types/index.ts` 行 6-25 | 前端类型通过 `@shared/events` 和 `@shared/intent-graph` 路径别名导入。根 tsconfig 和前端 tsconfig 都配置了此别名，但别名解析依赖构建工具（tsc 或 Vite）。如果通过根 tsc 编译前端文件（不应该，但 include 配置为 `src/**/*.ts`），会因缺少 jsx 支持而失败。**建议**：根 tsconfig 的 include 应排除 `src/frontend/**`。 |
| P2-NEW-2 | `src/frontend/package.json` 行 13 | 前端使用 Vitest 作为测试框架（`"test": "vitest"`），这与根项目使用 Jest 不冲突（独立 package.json），但需注意前端测试不会被根目录的 `npx jest` 捕获。前端测试需单独运行 `cd src/frontend && npm test`。 |
| P2-NEW-3 | `src/brain/cognition/cognition.service.ts` 行 218 | `updateStage` 方法的 Cypher SET 子句存在语法问题：`SET c.stage = $stage, c.updated_at = datetime() , c.verified = true`。第二个 SET 子句以逗号分隔跟在前面的 SET 后，但 `${stage === 'validated' ? ', c.verified = true' : ''}` 会在 SET 之后直接拼接逗号。如果 `stage !== 'validated'`，Cypher 语法正确；如果 `stage === 'validated'`，生成的 Cypher 为 `SET c.stage = $stage, c.updated_at = datetime() , c.verified = true`，此语法是合法的（多个 SET 属性用逗号分隔）。**实际无问题**，保留为建议改进。 |
| P2-NEW-4 | `src/frontend/api/brainClient.ts` 行 35-41 | 前端 `CreateGoalRequest` 不含 `layer` 和 `parent_id` 字段，与后端 `graph.service.ts` 的 `CreateGoalRequest` 不一致。这与 P2-1（API 契约差异）相关但方向相反 -- 前端遵循 API 契约（不含这两个字段），后端实现包含额外字段。 |

### P3

| ID | 文件 | 描述 |
|----|------|------|
| P3-NEW-1 | `src/frontend/api/brainClient.ts` 行 87-98 | 多处使用 `any[]` 返回类型（listAgents, listCognitionSignals, searchKnowledge），缺乏类型安全。 |
| P3-NEW-2 | `src/frontend/store/mapStore.ts` 行 68 | `onNodesChange` 的 `changes` 参数类型为 `any[]`，应使用 `@xyflow/react` 的 `NodeChange` 类型。 |
| P3-NEW-3 | `src/workflow/compiler/temporal-compiler.ts` 行 308 | Worker 代码生成中使用 `(input: any) => Promise<any>` 类型签名，降低类型安全。 |
| P3-NEW-4 | 各 workflow 测试文件 | 测试使用 Jest 全局函数但未导入（依赖 `@types/jest`），需确认 `jest.config.ts` 中 `testMatch` 覆盖 `tests/workflow/**`。 |
| P3-NEW-5 | `src/frontend/main.tsx` 行 7 | `document.getElementById('root')!` 使用非空断言。如果元素不存在会抛运行时错误。属于常见 React 模式，风险极低。 |

## Workflow 模块检查结果

### 文件清单（12 个文件）
- `src/workflow/types.ts` -- 类型定义，结构清晰，正确引用 `infra/shared` 类型
- `src/workflow/index.ts` -- 公共入口，导出所有子模块
- `src/workflow/parser/graph-parser.ts` -- 图谱解析器，包含拓扑排序、回环检测、关键路径分析
- `src/workflow/planner/execution-planner.ts` -- 执行策略引擎，能力匹配、并行分组、风险识别
- `src/workflow/compiler/temporal-compiler.ts` -- Temporal 代码生成器，将 DAG 编译为 Temporal Workflow 代码
- `src/workflow/listener/change-listener.ts` -- 变化监听器，缓冲区 + 分级响应
- `src/workflow/ai/intent-parser.ts` -- AI 意图解析器，Schema 验证 + 一致性检查

### 代码质量评价
- **架构设计**：清晰的 Parser -> Planner -> Compiler 管道设计，关注点分离良好
- **类型安全**：正确引用 `infra/shared` 类型，无重复定义
- **测试覆盖**：5 个测试文件覆盖所有核心模块，包含正向/反向/边界测试用例
- **潜在问题**：
  - Temporal Compiler 生成代码时使用字符串拼接，可能在极端输入下生成无效 TypeScript（如节点 label 含特殊字符）。`escapeStr` 函数仅处理单引号和换行符。
  - `ChangeListener` 在 `flushBuffer` 中调用 `clearTimeout` 后 delete timer，但 `bufferChange` 中 `major` 变化直接调用 `flushBuffer` 而不清除已设置的定时器（行 176-179），可能导致同一 goalId 的缓冲区被刷新两次。

### 测试文件清单（5 个文件 + 1 个辅助文件）
- `tests/workflow/parser.test.ts` -- 24 个测试用例，覆盖顺序/并行/回环图解析
- `tests/workflow/planner.test.ts` -- 14 个测试用例，覆盖能力匹配、并行分组、风险识别
- `tests/workflow/compiler.test.ts` -- 7 个测试用例，覆盖代码生成各场景
- `tests/workflow/listener.test.ts` -- 10 个测试用例，覆盖变化分级和缓冲区行为
- `tests/workflow/ai.test.ts` -- 8 个测试用例，覆盖 Schema 验证和一致性检查
- `tests/workflow/helpers.ts` -- 辅助工具，提供 makeGoalNode、makeTaskNode 等工厂函数

## Frontend 模块检查结果

### 文件清单（38 个 .ts/.tsx 文件）
- **types/**: 1 个类型定义文件，re-export shared 类型 + 前端特有类型
- **store/**: 3 个 Zustand store（chatStore, mapStore, onboardingStore）
- **api/**: 1 个 Brain API 客户端
- **realtime/**: 3 个文件（WsClient, eventHandlers, useRealtimeSync hook）
- **chat/**: 5 个组件（ChatPanel, ConversationHeader, MessageBubble, ExecutionCard, MessageInput）
- **map/**: 13 个组件（MapPanel, MapToolbar, LayerDividers, NodeDetailPanel, 6 个节点组件, 5 个边组件）
- **onboarding/**: 6 个组件（OnboardingWizard + 5 个步骤组件）
- **layout/**: 4 个组件（MainLayout, ConnectionIndicator, ImpactPreviewModal, SettingsPage）
- **App.tsx**: 路由入口
- **main.tsx**: React 挂载入口

### 构建配置
- 独立 `package.json` + `tsconfig.json`
- 使用 Vite + React + TypeScript
- 测试框架为 Vitest（独立于根项目的 Jest）
- 路径别名：`@shared/*` -> `../infra/shared/*`, `@/*` -> `./*`

### 代码质量评价
- **架构设计**：清晰的 store + component + api 分层，使用 Zustand 状态管理
- **类型安全**：正确 re-export shared 类型，前端特有类型定义完整
- **实时通信**：WsClient 实现完整（连接、断线重连、事件分发、通配符匹配）
- **地图组件**：正确使用 @xyflow/react，自定义节点和边组件齐全
- **潜在问题**：
  - `brainClient.ts` 多处使用 `any` 类型
  - 前端无错误边界组件（Error Boundary），异常可能导致白屏
  - 缺少前端单元测试文件（虽配置了 Vitest，但未发现 `tests/frontend/` 目录或任何 `.test.tsx` 文件）

## 结论

### 第一轮修复验证
- **P0 问题**：5/5 全部修复 ✅
- **P1 问题**：5/6 已修复（P1-6 需运行时验证）
- **P2 问题**：2/8 已修复（P2-6, P2-7），其余为已知架构技术债
- **P3 问题**：6/12 已修复，其余为技术债或需后续补充

### 新发现问题统计
- P0: 0 个
- P1: 0 个
- P2: 4 个（P2-NEW-1 ~ P2-NEW-4），其中 P2-NEW-1 建议排除前端目录
- P3: 5 个（P3-NEW-1 ~ P3-NEW-5），均为代码质量建议

### 总体评估
**核心阻塞问题已全部解决**。项目可以进入 `npm install` + `tsc --noEmit` + `jest` 实际编译/测试验证阶段。剩余问题均为 P2/P3 级别的技术债和代码质量改进建议，不影响基本功能。

### 手动验证步骤（需在终端执行）
```bash
# 1. 安装依赖
npm install

# 2. TypeScript 编译检查
npx tsc --noEmit

# 3. 运行所有测试
npx jest --passWithNoTests

# 4. 前端独立检查（可选）
cd src/frontend && npm install && npx tsc -b
```
