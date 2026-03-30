/**
 * 离线缓存队列
 *
 * 当龙虾断网时，缓存待发送的消息；重新连接后按顺序重发。
 */

import type { MessageFrame, OfflineQueueItem } from '../types';
import { generateId } from '../utils';

export class OfflineQueue {
  private queue: OfflineQueueItem[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 10_000) {
    this.maxSize = maxSize;
  }

  /**
   * 入队
   */
  enqueue(message: MessageFrame): void {
    if (this.queue.length >= this.maxSize) {
      // 丢弃最早的消息
      this.queue.shift();
    }

    this.queue.push({
      id: generateId(),
      message,
      queued_at: new Date().toISOString(),
      retry_count: 0,
    });
  }

  /**
   * 出队（按 FIFO 顺序）
   */
  dequeue(): OfflineQueueItem | undefined {
    return this.queue.shift();
  }

  /**
   * 查看队首但不移除
   */
  peek(): OfflineQueueItem | undefined {
    return this.queue[0];
  }

  /**
   * 取出全部并清空
   */
  drainAll(): OfflineQueueItem[] {
    const items = this.queue;
    this.queue = [];
    return items;
  }

  /**
   * 队列长度
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * 队列是否为空
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
  }
}
