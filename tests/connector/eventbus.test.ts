/**
 * 事件总线单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBusImpl } from '../../src/connector/eventbus/event-bus';
import { InMemoryEventStore } from '../../src/connector/eventbus/in-memory-event-store';
import type { ClawTeamsEvent } from '../../src/infra/shared';

function makeEvent(overrides: Partial<ClawTeamsEvent> = {}): ClawTeamsEvent {
  return {
    event_id: `evt-${Math.random().toString(36).slice(2)}`,
    event_type: 'task.completed',
    source: { service: 'test' },
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore(100);
  });

  it('should append and query events', async () => {
    const event = makeEvent();
    await store.append(event);
    const results = await store.query({});
    expect(results).toHaveLength(1);
    expect(results[0].event_id).toBe(event.event_id);
  });

  it('should filter by event_type', async () => {
    await store.append(makeEvent({ event_type: 'task.completed' }));
    await store.append(makeEvent({ event_type: 'task.failed' }));
    await store.append(makeEvent({ event_type: 'agent.registered' }));

    const results = await store.query({ event_type: 'task.failed' });
    expect(results).toHaveLength(1);
    expect(results[0].event_type).toBe('task.failed');
  });

  it('should filter by source_agent_id', async () => {
    await store.append(makeEvent({ source: { service: 'test', agent_id: 'a1' } }));
    await store.append(makeEvent({ source: { service: 'test', agent_id: 'a2' } }));

    const results = await store.query({ source_agent_id: 'a1' });
    expect(results).toHaveLength(1);
  });

  it('should respect limit', async () => {
    for (let i = 0; i < 10; i++) {
      await store.append(makeEvent());
    }
    const results = await store.query({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('should trim when exceeding maxSize', async () => {
    for (let i = 0; i < 120; i++) {
      await store.append(makeEvent());
    }
    // maxSize=100, trim 10%=10, so after 120 appends, trimmed to 110
    expect(store.size).toBeLessThanOrEqual(110);
  });
});

describe('EventBusImpl', () => {
  let bus: EventBusImpl;

  beforeEach(() => {
    bus = new EventBusImpl();
  });

  it('should deliver events to matching subscribers', async () => {
    const received: ClawTeamsEvent[] = [];
    await bus.subscribe('task.completed', async (e) => {
      received.push(e);
    });

    await bus.publish(makeEvent({ event_type: 'task.completed' }));
    await bus.publish(makeEvent({ event_type: 'task.failed' }));

    expect(received).toHaveLength(1);
    expect(received[0].event_type).toBe('task.completed');
  });

  it('should support wildcard patterns', async () => {
    const received: ClawTeamsEvent[] = [];
    await bus.subscribe('task.*', async (e) => {
      received.push(e);
    });

    await bus.publish(makeEvent({ event_type: 'task.completed' }));
    await bus.publish(makeEvent({ event_type: 'task.failed' }));
    await bus.publish(makeEvent({ event_type: 'agent.registered' }));

    expect(received).toHaveLength(2);
  });

  it('should support unsubscribe', async () => {
    const received: ClawTeamsEvent[] = [];
    const sub = await bus.subscribe('task.*', async (e) => {
      received.push(e);
    });

    await bus.publish(makeEvent({ event_type: 'task.completed' }));
    sub.unsubscribe();
    await bus.publish(makeEvent({ event_type: 'task.failed' }));

    expect(received).toHaveLength(1);
  });

  it('should persist events to store', async () => {
    await bus.publish(makeEvent({ event_type: 'task.completed' }));
    await bus.publish(makeEvent({ event_type: 'task.failed' }));

    const store = bus.getStore();
    const results = await store.query({});
    expect(results).toHaveLength(2);
  });

  it('should filter by team_id when subscriber specifies it', async () => {
    const received: ClawTeamsEvent[] = [];
    await bus.subscribe(
      'task.*',
      async (e) => { received.push(e); },
      'team-1',
    );

    await bus.publish(
      makeEvent({
        event_type: 'task.completed',
        payload: { team_id: 'team-1' },
      }),
    );
    await bus.publish(
      makeEvent({
        event_type: 'task.failed',
        payload: { team_id: 'team-2' },
      }),
    );

    expect(received).toHaveLength(1);
  });

  it('should not crash when handler throws', async () => {
    await bus.subscribe('task.*', async () => {
      throw new Error('handler error');
    });

    // Should not throw
    await bus.publish(makeEvent({ event_type: 'task.completed' }));
  });

  it('should emit event_published for WebSocket pushing', async () => {
    const published: ClawTeamsEvent[] = [];
    bus.onEventPublished((e) => published.push(e));

    await bus.publish(makeEvent());
    expect(published).toHaveLength(1);
  });
});
