/**
 * 变化监听器单元测试
 */

import {
  ChangeListener,
  classifyChange,
  mergeChangeLevel,
} from '../../src/workflow/listener';
import type { ChangeResponseHandler } from '../../src/workflow/listener';
import type { IntentChange } from '../../src/workflow/types';
import type { EventBus, EventHandler } from '../../src/infra/shared';

function makeChange(overrides: Partial<IntentChange> = {}): IntentChange {
  return {
    change_id: 'ch_1',
    goal_id: 'goal_1',
    level: 'minor',
    description: 'test change',
    added_nodes: [],
    removed_nodes: [],
    modified_nodes: [],
    added_edges: [],
    removed_edges: [],
    received_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('classifyChange', () => {
  it('仅修改节点 -> minor', () => {
    expect(classifyChange(makeChange({ modified_nodes: ['n1'] }))).toBe('minor');
  });

  it('新增节点 -> moderate', () => {
    expect(classifyChange(makeChange({ added_nodes: ['n1'] }))).toBe('moderate');
  });

  it('新增边 -> moderate', () => {
    expect(classifyChange(makeChange({ added_edges: ['e1'] }))).toBe('moderate');
  });

  it('删除节点 -> major', () => {
    expect(classifyChange(makeChange({ removed_nodes: ['n1'] }))).toBe('major');
  });

  it('删除多条边 -> major', () => {
    expect(classifyChange(makeChange({ removed_edges: ['e1', 'e2', 'e3'] }))).toBe('major');
  });

  it('大量新增节点 -> major', () => {
    expect(classifyChange(makeChange({ added_nodes: ['n1', 'n2', 'n3'] }))).toBe('major');
  });

  it('无变化 -> minor', () => {
    expect(classifyChange(makeChange())).toBe('minor');
  });
});

describe('mergeChangeLevel', () => {
  it('空数组 -> minor', () => {
    expect(mergeChangeLevel([])).toBe('minor');
  });

  it('含 major 则为 major', () => {
    expect(mergeChangeLevel(['minor', 'moderate', 'major'])).toBe('major');
  });

  it('含 moderate 无 major 则为 moderate', () => {
    expect(mergeChangeLevel(['minor', 'moderate'])).toBe('moderate');
  });

  it('全 minor 则为 minor', () => {
    expect(mergeChangeLevel(['minor', 'minor'])).toBe('minor');
  });
});

describe('ChangeListener', () => {
  let mockEventBus: EventBus;
  let mockHandler: ChangeResponseHandler;

  beforeEach(() => {
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockImplementation((_pattern: string, _handler: EventHandler) => {
        return Promise.resolve({ unsubscribe: jest.fn() });
      }),
    };
    mockHandler = {
      handleMinorChange: jest.fn().mockResolvedValue(undefined),
      handleModerateChange: jest.fn().mockResolvedValue(undefined),
      handleMajorChange: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('缓冲 minor 变化', () => {
    const listener = new ChangeListener({
      eventBus: mockEventBus,
      responseHandler: mockHandler,
      bufferWindowMs: 100000,
    });

    const change = makeChange({ modified_nodes: ['n1'] });
    listener.bufferChange(change);

    const buffer = listener.getBufferState('goal_1');
    expect(buffer).toBeDefined();
    expect(buffer!.changes).toHaveLength(1);
    expect(buffer!.merged_level).toBe('minor');
  });

  it('major 变化立即刷新', async () => {
    const listener = new ChangeListener({
      eventBus: mockEventBus,
      responseHandler: mockHandler,
      bufferWindowMs: 100000,
    });

    const change = makeChange({ removed_nodes: ['n1'] });
    change.level = classifyChange(change);
    listener.bufferChange(change);

    expect(listener.getBufferState('goal_1')).toBeUndefined();
    expect(mockHandler.handleMajorChange).toHaveBeenCalledWith('goal_1', [change]);
  });

  it('手动刷新缓冲区触发 minor handler', async () => {
    const listener = new ChangeListener({
      eventBus: mockEventBus,
      responseHandler: mockHandler,
    });

    const change = makeChange({ modified_nodes: ['n1'], level: 'minor' });
    listener.bufferChange(change);
    await listener.flushBuffer('goal_1');

    expect(mockHandler.handleMinorChange).toHaveBeenCalledWith('goal_1', [change]);
  });

  it('合并多个变化等级', async () => {
    const listener = new ChangeListener({
      eventBus: mockEventBus,
      responseHandler: mockHandler,
    });

    listener.bufferChange(makeChange({ change_id: 'c1', modified_nodes: ['n1'], level: 'minor' }));
    listener.bufferChange(makeChange({ change_id: 'c2', added_nodes: ['n2'], level: 'moderate' }));

    const buffer = listener.getBufferState('goal_1');
    expect(buffer!.merged_level).toBe('moderate');

    await listener.flushBuffer('goal_1');
    expect(mockHandler.handleModerateChange).toHaveBeenCalled();
  });

  it('getActiveBufferGoalIds 返回正确的目标 ID', () => {
    const listener = new ChangeListener({
      eventBus: mockEventBus,
      responseHandler: mockHandler,
    });

    listener.bufferChange(makeChange({ goal_id: 'g1', modified_nodes: ['n1'] }));
    listener.bufferChange(makeChange({ goal_id: 'g2', modified_nodes: ['n2'] }));

    const ids = listener.getActiveBufferGoalIds();
    expect(ids).toContain('g1');
    expect(ids).toContain('g2');
  });
});
