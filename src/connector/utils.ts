/**
 * 连接层工具函数
 */

import { randomUUID } from 'crypto';
import type { MessageFrame, MessageType } from './types';

/** 生成 UUID */
export function generateId(): string {
  return randomUUID();
}

/** 创建消息帧 */
export function createFrame<T>(
  msg_type: MessageType,
  payload: T,
  reply_to?: string,
): MessageFrame<T> {
  return {
    msg_type,
    msg_id: generateId(),
    timestamp: new Date().toISOString(),
    reply_to,
    payload,
  };
}

/** 判断事件类型是否匹配通配符模式 */
export function matchEventPattern(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === eventType) return true;

  // 支持 "task.*" 风格的通配符
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return eventType.startsWith(prefix + '.');
  }

  // 支持 "*.completed" 风格
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return eventType.endsWith('.' + suffix);
  }

  return false;
}

/** 序列化消息帧 */
export function serializeFrame(frame: MessageFrame): string {
  return JSON.stringify(frame);
}

/** 反序列化消息帧 */
export function deserializeFrame(data: string): MessageFrame {
  const parsed = JSON.parse(data);
  if (!parsed.msg_type || !parsed.msg_id || !parsed.timestamp) {
    throw new Error('Invalid message frame: missing required fields');
  }
  return parsed as MessageFrame;
}

/** 指数退避计算 */
export function calculateBackoff(
  attempt: number,
  initialMs: number = 1000,
  maxMs: number = 30000,
  multiplier: number = 2,
): number {
  const delay = Math.min(initialMs * Math.pow(multiplier, attempt), maxMs);
  // 添加 +-25% 的抖动
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(delay + jitter));
}
