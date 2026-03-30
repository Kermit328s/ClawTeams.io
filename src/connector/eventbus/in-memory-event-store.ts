/**
 * 内存事件持久化存储
 * 用于审计和回放；生产环境可替换为 Kafka / PostgreSQL 实现
 */

import type { ClawTeamsEvent } from '../../infra/shared';
import type { EventStore, EventQueryFilter } from '../types';

export class InMemoryEventStore implements EventStore {
  private events: ClawTeamsEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 100_000) {
    this.maxSize = maxSize;
  }

  async append(event: ClawTeamsEvent): Promise<void> {
    this.events.push(event);
    // 超出上限时丢弃最旧的 10%
    if (this.events.length > this.maxSize) {
      const trimCount = Math.floor(this.maxSize * 0.1);
      this.events = this.events.slice(trimCount);
    }
  }

  async query(filter: EventQueryFilter): Promise<ClawTeamsEvent[]> {
    let result = this.events;

    if (filter.event_type) {
      result = result.filter((e) => e.event_type === filter.event_type);
    }

    if (filter.source_agent_id) {
      result = result.filter(
        (e) => e.source.agent_id === filter.source_agent_id,
      );
    }

    if (filter.correlation_id) {
      result = result.filter(
        (e) => e.correlation_id === filter.correlation_id,
      );
    }

    if (filter.from_time) {
      const from = new Date(filter.from_time).getTime();
      result = result.filter(
        (e) => new Date(e.timestamp).getTime() >= from,
      );
    }

    if (filter.to_time) {
      const to = new Date(filter.to_time).getTime();
      result = result.filter(
        (e) => new Date(e.timestamp).getTime() <= to,
      );
    }

    if (filter.limit && filter.limit > 0) {
      result = result.slice(-filter.limit);
    }

    return result;
  }

  /** 获取存储的事件总数 */
  get size(): number {
    return this.events.length;
  }

  /** 清空存储（用于测试） */
  clear(): void {
    this.events = [];
  }
}
