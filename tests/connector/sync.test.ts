/**
 * 状态同步模块单元测试
 */


import { OfflineQueue } from '../../src/connector/sync/offline-queue';
import { AgentStateTracker } from '../../src/connector/sync/agent-state-tracker';
import type { MessageFrame } from '../../src/connector/types';

function makeFrame(type: string = 'task.report'): MessageFrame {
  return {
    msg_type: type as any,
    msg_id: `msg-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    payload: {},
  };
}

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = new OfflineQueue(5);
  });

  it('should enqueue and dequeue in FIFO order', () => {
    queue.enqueue(makeFrame('task.report'));
    queue.enqueue(makeFrame('agent.heartbeat'));

    const item1 = queue.dequeue();
    expect(item1?.message.msg_type).toBe('task.report');

    const item2 = queue.dequeue();
    expect(item2?.message.msg_type).toBe('agent.heartbeat');

    expect(queue.isEmpty).toBe(true);
  });

  it('should drop oldest when exceeding maxSize', () => {
    for (let i = 0; i < 7; i++) {
      queue.enqueue(makeFrame(`type-${i}` as any));
    }

    expect(queue.size).toBe(5);
    // first 2 should have been dropped
    const item = queue.dequeue();
    expect(item?.message.msg_type).toBe('type-2');
  });

  it('should drain all items', () => {
    queue.enqueue(makeFrame());
    queue.enqueue(makeFrame());
    queue.enqueue(makeFrame());

    const items = queue.drainAll();
    expect(items).toHaveLength(3);
    expect(queue.isEmpty).toBe(true);
  });

  it('should peek without removing', () => {
    queue.enqueue(makeFrame());
    const peeked = queue.peek();
    expect(peeked).toBeDefined();
    expect(queue.size).toBe(1);
  });
});

describe('AgentStateTracker', () => {
  let tracker: AgentStateTracker;

  beforeEach(() => {
    tracker = new AgentStateTracker();
  });

  it('should mark agent online', () => {
    tracker.markOnline('agent-1', 'session-1');
    expect(tracker.isOnline('agent-1')).toBe(true);

    const state = tracker.getState('agent-1');
    expect(state?.online_status).toBe('online');
    expect(state?.session_id).toBe('session-1');
  });

  it('should mark agent offline', () => {
    tracker.markOnline('agent-1', 'session-1');
    tracker.markOffline('agent-1');
    expect(tracker.isOnline('agent-1')).toBe(false);
    expect(tracker.getState('agent-1')?.online_status).toBe('offline');
  });

  it('should track online agents', () => {
    tracker.markOnline('agent-1', 's1');
    tracker.markOnline('agent-2', 's2');
    tracker.markOffline('agent-1');

    const online = tracker.getOnlineAgents();
    expect(online).toHaveLength(1);
    expect(online[0].agent_id).toBe('agent-2');
  });

  it('should update heartbeat status', () => {
    tracker.markOnline('agent-1', 's1');
    tracker.updateHeartbeat('agent-1', 'busy');

    const state = tracker.getState('agent-1');
    expect(state?.heartbeat_status).toBe('busy');
  });

  it('should update three layers', () => {
    const now = new Date().toISOString();

    tracker.updateSkillLayer('agent-1', {
      agent_id: 'agent-1',
      tools: ['tool-1'],
      parameters: {},
      capabilities: [{ name: 'code_review', version: '1.0' }],
      updated_at: now,
    });

    tracker.updateEnvironmentLayer('agent-1', {
      agent_id: 'agent-1',
      dependencies: { typescript: '5.0' },
      env_vars: {},
      updated_at: now,
    });

    tracker.updateDataContextLayer('agent-1', {
      agent_id: 'agent-1',
      execution_history_ids: ['hist-1'],
      business_data_refs: [],
      team_id: 'team-1',
      updated_at: now,
    });

    const state = tracker.getState('agent-1');
    expect(state?.three_layers?.skill.tools).toEqual(['tool-1']);
    expect(state?.three_layers?.environment.dependencies).toEqual({ typescript: '5.0' });
    expect(state?.three_layers?.data_context.team_id).toBe('team-1');
  });

  it('should track sync pending state', () => {
    tracker.markOnline('agent-1', 's1');
    // markOnline sets sync_pending = false for fresh agents (no three_layers)
    tracker.markSyncPending('agent-1');
    expect(tracker.getPendingSyncAgents()).toHaveLength(1);

    tracker.markSynced('agent-1');
    expect(tracker.getPendingSyncAgents()).toHaveLength(0);
  });

  it('should emit status_changed events', () => {
    const events: any[] = [];
    tracker.on('status_changed', (e) => events.push(e));

    tracker.markOnline('agent-1', 's1');
    tracker.markOffline('agent-1');

    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('online');
    expect(events[1].status).toBe('offline');
  });

  it('should remove agent state', () => {
    tracker.markOnline('agent-1', 's1');
    tracker.remove('agent-1');
    expect(tracker.getState('agent-1')).toBeUndefined();
  });
});
