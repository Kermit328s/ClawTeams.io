import { describe, it, expect, beforeEach } from 'vitest';
import { handleEvent } from '../../src/frontend/realtime/eventHandlers';
import { useMapStore } from '../../src/frontend/store/mapStore';
import { useChatStore } from '../../src/frontend/store/chatStore';
import type { ClawTeamsEvent } from '../../src/infra/shared/events';
import type { MapNodeData } from '../../src/frontend/types';

function makeEvent(type: string, payload: Record<string, unknown>): ClawTeamsEvent {
  return {
    event_id: 'test-event-1',
    event_type: type as any,
    source: { service: 'test' },
    timestamp: new Date().toISOString(),
    payload,
  };
}

describe('eventHandlers', () => {
  beforeEach(() => {
    useMapStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      detailPanelOpen: false,
      isGenerating: false,
    });
    useChatStore.setState({
      conversations: [
        {
          id: 'brain-default',
          type: 'human-brain',
          title: 'Test',
          participants: [],
          unreadCount: 0,
        },
      ],
      activeConversationId: 'brain-default',
      messagesByConversation: { 'brain-default': [] },
      isSending: false,
      isLoadingHistory: false,
    });
  });

  it('should add a task node on task.created', () => {
    handleEvent(makeEvent('task.created', {
      task_id: 'new-task',
      title: 'My Task',
    }));

    const nodes = useMapStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('new-task');
    expect((nodes[0].data as MapNodeData).label).toBe('My Task');
    expect((nodes[0].data as MapNodeData).isDraft).toBe(true);
  });

  it('should update task status on task.started', () => {
    // Add a task first
    useMapStore.getState().addNode({
      id: 'task-x',
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Task X',
        nodeType: 'task',
        layer: 'execution',
        taskStatus: 'gray',
      } as MapNodeData,
    });

    handleEvent(makeEvent('task.started', { task_id: 'task-x' }));

    const node = useMapStore.getState().nodes.find((n) => n.id === 'task-x');
    expect((node?.data as MapNodeData).taskStatus).toBe('blue');
  });

  it('should update task status on task.completed', () => {
    useMapStore.getState().addNode({
      id: 'task-y',
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Task Y',
        nodeType: 'task',
        layer: 'execution',
        taskStatus: 'blue',
      } as MapNodeData,
    });

    handleEvent(makeEvent('task.completed', { task_id: 'task-y' }));

    const node = useMapStore.getState().nodes.find((n) => n.id === 'task-y');
    expect((node?.data as MapNodeData).taskStatus).toBe('green');
  });

  it('should update task status on task.failed', () => {
    useMapStore.getState().addNode({
      id: 'task-f',
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Task F',
        nodeType: 'task',
        layer: 'execution',
        taskStatus: 'blue',
      } as MapNodeData,
    });

    handleEvent(makeEvent('task.failed', { task_id: 'task-f' }));

    const node = useMapStore.getState().nodes.find((n) => n.id === 'task-f');
    expect((node?.data as MapNodeData).taskStatus).toBe('red');
  });

  it('should add goal node on intent.goal_created', () => {
    handleEvent(makeEvent('intent.goal_created', {
      goal_id: 'goal-new',
      title: 'New Goal',
    }));

    const nodes = useMapStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('goal-new');
  });

  it('should add cognition node on cognition.signal_emitted', () => {
    handleEvent(makeEvent('cognition.signal_emitted', {
      signal_id: 'sig-1',
      pattern_description: 'Pattern found',
    }));

    const nodes = useMapStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect((nodes[0].data as MapNodeData).nodeType).toBe('cognition');
  });

  it('should add chat message on cognition.decision_required', () => {
    handleEvent(makeEvent('cognition.decision_required', {
      description: 'Need human input',
    }));

    const msgs = useChatStore.getState().messagesByConversation['brain-default'];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain('需要人工决策');
  });

  it('should add chat message on workflow.failed', () => {
    handleEvent(makeEvent('workflow.failed', {
      workflow_id: 'wf-1',
    }));

    const msgs = useChatStore.getState().messagesByConversation['brain-default'];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain('执行失败');
  });
});
