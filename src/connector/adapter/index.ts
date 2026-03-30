/**
 * 适配器模块导出
 */

export { OutputHook } from './output-hook';
export type { BrainWriter, OutputHookOptions } from './output-hook';
export { ContextInjector } from './context-injector';
export type { BrainReader, ContextInjectorOptions, TaskAssignInput, EnrichedTaskAssign } from './context-injector';
export { EventSubscriber } from './event-subscriber';
export type { AgentSubscription, EventSubscriberOptions } from './event-subscriber';
