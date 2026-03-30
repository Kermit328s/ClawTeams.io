/**
 * Event Subscriber（事件订阅器）
 *
 * 为龙虾订阅相关事件 -> 收到事件时触发回调
 * 管理龙虾的事件订阅生命周期
 */

import type { ClawTeamsEvent, EventHandler } from '../../infra/shared';
import type { EventBusImpl } from '../eventbus/event-bus';

export interface AgentSubscription {
  agentId: string;
  patterns: string[];
  callback: EventHandler;
  unsubscribers: Array<{ unsubscribe: () => void }>;
}

export interface EventSubscriberOptions {
  eventBus: EventBusImpl;
}

export class EventSubscriber {
  private readonly eventBus: EventBusImpl;
  /** agent_id -> subscription 映射 */
  private agentSubscriptions = new Map<string, AgentSubscription>();

  constructor(options: EventSubscriberOptions) {
    this.eventBus = options.eventBus;
  }

  /**
   * 为龙虾创建事件订阅
   * @param agentId 龙虾 ID
   * @param patterns 事件类型模式列表（支持通配符）
   * @param callback 收到事件时的回调
   */
  async subscribeForAgent(
    agentId: string,
    patterns: string[],
    callback: EventHandler,
  ): Promise<void> {
    // 先清理旧订阅
    await this.unsubscribeAgent(agentId);

    const unsubscribers: Array<{ unsubscribe: () => void }> = [];

    for (const pattern of patterns) {
      const sub = await this.eventBus.subscribe(pattern, callback);
      unsubscribers.push(sub);
    }

    this.agentSubscriptions.set(agentId, {
      agentId,
      patterns,
      callback,
      unsubscribers,
    });
  }

  /**
   * 取消龙虾的所有事件订阅
   */
  async unsubscribeAgent(agentId: string): Promise<void> {
    const existing = this.agentSubscriptions.get(agentId);
    if (existing) {
      for (const unsub of existing.unsubscribers) {
        unsub.unsubscribe();
      }
      this.agentSubscriptions.delete(agentId);
    }
  }

  /**
   * 获取龙虾的订阅模式
   */
  getAgentPatterns(agentId: string): string[] {
    return this.agentSubscriptions.get(agentId)?.patterns ?? [];
  }

  /**
   * 获取所有有订阅的龙虾 ID
   */
  getSubscribedAgentIds(): string[] {
    return Array.from(this.agentSubscriptions.keys());
  }

  /**
   * 清理所有订阅
   */
  async clearAll(): Promise<void> {
    for (const agentId of this.agentSubscriptions.keys()) {
      await this.unsubscribeAgent(agentId);
    }
  }
}
