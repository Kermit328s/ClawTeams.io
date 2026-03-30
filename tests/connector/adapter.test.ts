/**
 * 适配器单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutputHook } from '../../src/connector/adapter/output-hook';
import { ContextInjector } from '../../src/connector/adapter/context-injector';
import { EventSubscriber } from '../../src/connector/adapter/event-subscriber';
import { EventBusImpl } from '../../src/connector/eventbus/event-bus';
import type { BrainWriter } from '../../src/connector/adapter/output-hook';
import type { BrainReader } from '../../src/connector/adapter/context-injector';
import type { TaskReportPayload } from '../../src/connector/types';
import type { ClawTeamsEvent } from '../../src/infra/shared';

describe('OutputHook', () => {
  let eventBus: EventBusImpl;
  let outputHook: OutputHook;
  let mockWriter: BrainWriter;

  beforeEach(() => {
    eventBus = new EventBusImpl();
    mockWriter = { writeStateUnit: vi.fn().mockResolvedValue(undefined) };
    outputHook = new OutputHook({ eventBus, brainWriter: mockWriter });
  });

  it('should generate StateUnit for terminal states', async () => {
    const report: TaskReportPayload = {
      task_id: 'task-1',
      agent_id: 'agent-1',
      state: 'completed',
      state_unit: { output: 'result data' },
    };

    const stateUnit = await outputHook.handleTaskReport(report);
    expect(stateUnit).not.toBeNull();
    expect(stateUnit!.task_id).toBe('task-1');
    expect(stateUnit!.agent_id).toBe('agent-1');
    expect(stateUnit!.state).toBe('completed');
  });

  it('should write StateUnit to brain', async () => {
    const report: TaskReportPayload = {
      task_id: 'task-1',
      agent_id: 'agent-1',
      state: 'completed',
    };

    await outputHook.handleTaskReport(report);
    expect(mockWriter.writeStateUnit).toHaveBeenCalledTimes(1);
  });

  it('should return null for non-terminal states', async () => {
    const report: TaskReportPayload = {
      task_id: 'task-1',
      agent_id: 'agent-1',
      state: 'running',
      progress_percent: 50,
    };

    const stateUnit = await outputHook.handleTaskReport(report);
    expect(stateUnit).toBeNull();
  });

  it('should publish task.completed event for completed state', async () => {
    const received: ClawTeamsEvent[] = [];
    await eventBus.subscribe('task.completed', async (e) => received.push(e));

    await outputHook.handleTaskReport({
      task_id: 'task-1',
      agent_id: 'agent-1',
      state: 'completed',
    });

    expect(received).toHaveLength(1);
    expect((received[0].payload as any).task_id).toBe('task-1');
  });

  it('should publish task.failed event for failed state', async () => {
    const received: ClawTeamsEvent[] = [];
    await eventBus.subscribe('task.failed', async (e) => received.push(e));

    await outputHook.handleTaskReport({
      task_id: 'task-1',
      agent_id: 'agent-1',
      state: 'failed',
      error: { code: 'TIMEOUT', message: 'Timed out', retryable: true },
    });

    expect(received).toHaveLength(1);
  });

  it('should publish progress event for running state', async () => {
    const received: ClawTeamsEvent[] = [];
    await eventBus.subscribe('task.started', async (e) => received.push(e));

    await outputHook.handleTaskReport({
      task_id: 'task-1',
      agent_id: 'agent-1',
      state: 'running',
      progress_percent: 30,
    });

    expect(received).toHaveLength(1);
  });
});

describe('ContextInjector', () => {
  it('should enrich task with context from brain', async () => {
    const mockReader: BrainReader = {
      getTaskContext: vi.fn().mockResolvedValue({
        goal_id: 'goal-1',
        workflow_id: 'wf-1',
        team_id: 'team-1',
        intent_graph_version: 1,
        dag_position: { depth: 0, parallel_count: 1, is_leaf: true },
      }),
      getUpstreamStateUnits: vi.fn().mockResolvedValue([
        {
          task_id: 'upstream-1',
          agent_id: 'agent-0',
          state: 'completed',
          result: { type: 'json', data: { value: 42 } },
          artifact_ids: [],
          timestamp: new Date().toISOString(),
          version: 1,
          upstream_task_ids: [],
          downstream_task_ids: [],
        },
      ]),
      getTeamContext: vi.fn().mockResolvedValue({ shared_key: 'shared_value' }),
    };

    const injector = new ContextInjector({ brainReader: mockReader });

    const enriched = await injector.enrichTaskAssignment(
      {
        task_id: 'task-1',
        task_type: 'code_review',
        input: { repo: 'test' },
        deadline: new Date().toISOString(),
      },
      'team-1',
    );

    expect(enriched.context._task_context).toBeDefined();
    expect(enriched.context._upstream_results).toHaveLength(1);
    expect(enriched.context._team_context).toEqual({ shared_key: 'shared_value' });
  });

  it('should work without brain reader', async () => {
    const injector = new ContextInjector();

    const enriched = await injector.enrichTaskAssignment(
      {
        task_id: 'task-1',
        task_type: 'test',
        input: {},
        deadline: new Date().toISOString(),
        context: { existing: true },
      },
      'team-1',
    );

    expect(enriched.context).toEqual({ existing: true });
  });
});

describe('EventSubscriber', () => {
  let eventBus: EventBusImpl;
  let subscriber: EventSubscriber;

  beforeEach(() => {
    eventBus = new EventBusImpl();
    subscriber = new EventSubscriber({ eventBus });
  });

  it('should subscribe agent to events and trigger callback', async () => {
    const received: ClawTeamsEvent[] = [];
    await subscriber.subscribeForAgent(
      'agent-1',
      ['task.*'],
      async (e) => { received.push(e); },
    );

    await eventBus.publish({
      event_id: 'e1',
      event_type: 'task.completed',
      source: { service: 'test' },
      timestamp: new Date().toISOString(),
      payload: {},
    });

    expect(received).toHaveLength(1);
  });

  it('should unsubscribe agent', async () => {
    const received: ClawTeamsEvent[] = [];
    await subscriber.subscribeForAgent(
      'agent-1',
      ['task.*'],
      async (e) => { received.push(e); },
    );

    await subscriber.unsubscribeAgent('agent-1');

    await eventBus.publish({
      event_id: 'e1',
      event_type: 'task.completed',
      source: { service: 'test' },
      timestamp: new Date().toISOString(),
      payload: {},
    });

    expect(received).toHaveLength(0);
  });

  it('should replace existing subscription on re-subscribe', async () => {
    const received1: ClawTeamsEvent[] = [];
    const received2: ClawTeamsEvent[] = [];

    await subscriber.subscribeForAgent('agent-1', ['task.*'], async (e) => {
      received1.push(e);
    });
    await subscriber.subscribeForAgent('agent-1', ['workflow.*'], async (e) => {
      received2.push(e);
    });

    await eventBus.publish({
      event_id: 'e1',
      event_type: 'task.completed',
      source: { service: 'test' },
      timestamp: new Date().toISOString(),
      payload: {},
    });

    await eventBus.publish({
      event_id: 'e2',
      event_type: 'workflow.completed',
      source: { service: 'test' },
      timestamp: new Date().toISOString(),
      payload: {},
    });

    expect(received1).toHaveLength(0); // old subscription removed
    expect(received2).toHaveLength(1);
  });

  it('should track subscribed agents', async () => {
    await subscriber.subscribeForAgent('agent-1', ['task.*'], async () => {});
    await subscriber.subscribeForAgent('agent-2', ['workflow.*'], async () => {});

    expect(subscriber.getSubscribedAgentIds()).toEqual(
      expect.arrayContaining(['agent-1', 'agent-2']),
    );
    expect(subscriber.getAgentPatterns('agent-1')).toEqual(['task.*']);
  });
});
