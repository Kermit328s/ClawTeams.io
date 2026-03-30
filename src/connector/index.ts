/**
 * ClawTeams 连接层
 * 统一导出所有模块
 */

// 事件总线
export { EventBusImpl, InMemoryEventStore } from './eventbus';

// 适配器
export {
  OutputHook,
  ContextInjector,
  EventSubscriber,
} from './adapter';
export type {
  BrainWriter,
  BrainReader,
  TaskAssignInput,
  EnrichedTaskAssign,
} from './adapter';

// 通信协议
export { ConnectionManager, WsServer } from './protocol';
export type { ConnectionManagerOptions, WsServerOptions } from './protocol';

// 状态同步
export {
  OfflineQueue,
  AgentStateTracker,
  SyncManager,
} from './sync';
export type { OnlineStatus, AgentStateSnapshot, SyncManagerOptions } from './sync';

// 类型和工具
export * from './types';
export * from './utils';
