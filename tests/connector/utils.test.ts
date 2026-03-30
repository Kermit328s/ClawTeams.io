/**
 * 工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  generateId,
  createFrame,
  matchEventPattern,
  serializeFrame,
  deserializeFrame,
  calculateBackoff,
} from '../../src/connector/utils';

describe('generateId', () => {
  it('should return a UUID string', () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('should return unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('createFrame', () => {
  it('should create a valid message frame', () => {
    const frame = createFrame('task.report', { task_id: '123' });
    expect(frame.msg_type).toBe('task.report');
    expect(frame.msg_id).toBeDefined();
    expect(frame.timestamp).toBeDefined();
    expect(frame.payload).toEqual({ task_id: '123' });
  });

  it('should include reply_to when provided', () => {
    const frame = createFrame('agent.register_ack', { success: true }, 'orig-id');
    expect(frame.reply_to).toBe('orig-id');
  });
});

describe('matchEventPattern', () => {
  it('should match exact event type', () => {
    expect(matchEventPattern('task.completed', 'task.completed')).toBe(true);
    expect(matchEventPattern('task.completed', 'task.failed')).toBe(false);
  });

  it('should match wildcard *', () => {
    expect(matchEventPattern('task.completed', '*')).toBe(true);
  });

  it('should match prefix wildcard (domain.*)', () => {
    expect(matchEventPattern('task.completed', 'task.*')).toBe(true);
    expect(matchEventPattern('task.failed', 'task.*')).toBe(true);
    expect(matchEventPattern('agent.registered', 'task.*')).toBe(false);
  });

  it('should match suffix wildcard (*.action)', () => {
    expect(matchEventPattern('task.completed', '*.completed')).toBe(true);
    expect(matchEventPattern('workflow.completed', '*.completed')).toBe(true);
    expect(matchEventPattern('task.failed', '*.completed')).toBe(false);
  });
});

describe('serializeFrame / deserializeFrame', () => {
  it('should round-trip correctly', () => {
    const frame = createFrame('task.report', { data: 'test' });
    const json = serializeFrame(frame);
    const parsed = deserializeFrame(json);
    expect(parsed).toEqual(frame);
  });

  it('should throw on invalid JSON', () => {
    expect(() => deserializeFrame('not json')).toThrow();
  });

  it('should throw on missing required fields', () => {
    expect(() => deserializeFrame(JSON.stringify({ foo: 'bar' }))).toThrow(
      'Invalid message frame',
    );
  });
});

describe('calculateBackoff', () => {
  it('should return increasing delays', () => {
    // Use fixed seed-like approach: just check trend
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      delays.push(calculateBackoff(i, 1000, 30000, 2));
    }
    // delays should generally increase (allowing for jitter)
    // Check that delay at attempt 4 is much larger than attempt 0
    // Since jitter is +-25%, worst case attempt 0 = 1250, best case attempt 4 = 12000
    expect(delays[4]).toBeGreaterThan(delays[0] * 2);
  });

  it('should not exceed maxMs (within jitter)', () => {
    const delay = calculateBackoff(100, 1000, 30000, 2);
    // With 25% jitter, max is 30000 * 1.25 = 37500
    expect(delay).toBeLessThanOrEqual(37500);
  });

  it('should return non-negative values', () => {
    for (let i = 0; i < 20; i++) {
      expect(calculateBackoff(i)).toBeGreaterThanOrEqual(0);
    }
  });
});
