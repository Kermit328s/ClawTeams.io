/**
 * 事件总线实现
 * 基于内存发布/订阅 + WebSocket 推送 + 可选持久化
 *
 * 功能：
 * - 事件发布/订阅（支持通配符模式）
 * - 按 team_id / topic 过滤路由
 * - 事件持久化（审计 & 回放）
 * - WebSocket 推送给前端和龙虾
 */

import { EventEmitter } from 'events';
import type {
  ClawTeamsEvent,
  EventHandler,
  EventBus as IEventBus,
} from '../../infra/shared';
import type { EventStore } from '../types';
import { matchEventPattern } from '../utils';
import { InMemoryEventStore } from './in-memory-event-store';

interface Subscription {
  id: string;
  pattern: string;
  handler: EventHandler;
  teamId?: string; // 可选的 team_id 过滤
}

export class EventBusImpl implements IEventBus {
  private subscriptions = new Map<string, Subscription>();
  private subIdCounter = 0;
  private readonly store: EventStore;
  private readonly emitter = new EventEmitter();

  constructor(store?: EventStore) {
    this.store = store ?? new InMemoryEventStore();
    this.emitter.setMaxListeners(1000);
  }

  /**
   * 发布事件
   * 1. 持久化到存储
   * 2. 分发给所有匹配的订阅者
   */
  async publish(event: ClawTeamsEvent): Promise<void> {
    // 持久化
    await this.store.append(event);

    // 分发给匹配的订阅者
    const deliveryPromises: Promise<void>[] = [];

    for (const sub of this.subscriptions.values()) {
      if (!matchEventPattern(event.event_type, sub.pattern)) continue;

      // 如果订阅指定了 team_id，检查事件的 payload 或 metadata 中是否包含该 team_id
      if (sub.teamId && !this.eventMatchesTeam(event, sub.teamId)) continue;

      deliveryPromises.push(
        sub.handler(event).catch((err) => {
          this.emitter.emit('handler_error', {
            subscription_id: sub.id,
            pattern: sub.pattern,
            event_id: event.event_id,
            error: err,
          });
        }),
      );
    }

    await Promise.allSettled(deliveryPromises);

    // 发出内部通知（用于 WebSocket 推送等）
    this.emitter.emit('event_published', event);
  }

  /**
   * 订阅事件
   * @param pattern 事件类型模式，支持通配符（如 "task.*"）
   * @param handler 事件处理函数
   * @param teamId 可选的 team_id 过滤
   */
  async subscribe(
    pattern: string,
    handler: EventHandler,
    teamId?: string,
  ): Promise<{ unsubscribe: () => void }> {
    const id = `sub_${++this.subIdCounter}`;
    const subscription: Subscription = { id, pattern, handler, teamId };
    this.subscriptions.set(id, subscription);

    return {
      unsubscribe: () => {
        this.subscriptions.delete(id);
      },
    };
  }

  /**
   * 监听内部事件（用于连接 WebSocket 推送）
   */
  onEventPublished(listener: (event: ClawTeamsEvent) => void): void {
    this.emitter.on('event_published', listener);
  }

  /**
   * 监听订阅处理器错误
   */
  onHandlerError(
    listener: (info: {
      subscription_id: string;
      pattern: string;
      event_id: string;
      error: unknown;
    }) => void,
  ): void {
    this.emitter.on('handler_error', listener);
  }

  /**
   * 获取事件存储（用于查询/回放）
   */
  getStore(): EventStore {
    return this.store;
  }

  /**
   * 当前活跃订阅数量
   */
  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * 清理所有订阅（用于关闭时）
   */
  clearAll(): void {
    this.subscriptions.clear();
    this.emitter.removeAllListeners();
  }

  /**
   * 检查事件是否与指定的 team_id 匹配
   */
  private eventMatchesTeam(event: ClawTeamsEvent, teamId: string): boolean {
    const payload = event.payload as Record<string, unknown>;
    if (payload?.team_id === teamId) return true;

    const metadata = event.metadata as Record<string, unknown> | undefined;
    if (metadata?.team_id === teamId) return true;

    return false;
  }
}
