/**
 * Event handlers that process incoming WebSocket events
 * and update the Zustand stores accordingly.
 */

import type { ClawTeamsEvent } from '@shared/events';
import type { TaskState } from '@shared/intent-graph';
import { useMapStore } from '@/store/mapStore';
import { useChatStore } from '@/store/chatStore';
import type { CognitionVisualState, TaskColorStatus } from '@/types';

/**
 * Processes a ClawTeamsEvent and dispatches updates to the relevant stores.
 */
export function handleEvent(event: ClawTeamsEvent): void {
  const { event_type, payload } = event;

  switch (event_type) {
    // ─── Task events → update map node status ───
    case 'task.created':
      handleTaskCreated(payload);
      break;
    case 'task.started':
      handleTaskStatusChange(payload, 'running');
      break;
    case 'task.completed':
      handleTaskStatusChange(payload, 'completed');
      break;
    case 'task.failed':
      handleTaskStatusChange(payload, 'failed');
      break;
    case 'task.blocked':
      handleTaskStatusChange(payload, 'blocked');
      break;
    case 'task.human_required':
      handleTaskStatusChange(payload, 'human_required');
      break;
    case 'task.assigned':
      handleTaskStatusChange(payload, 'assigned');
      break;

    // ─── Workflow events ───
    case 'workflow.started':
    case 'workflow.step_started':
    case 'workflow.step_completed':
    case 'workflow.completed':
    case 'workflow.failed':
    case 'workflow.paused':
      handleWorkflowEvent(event);
      break;

    // ─── Intent events → update map graph ───
    case 'intent.graph_updated':
      handleIntentGraphUpdated(payload);
      break;
    case 'intent.goal_created':
      handleGoalCreated(payload);
      break;
    case 'intent.decomposed':
      handleDecomposed(payload);
      break;

    // ─── Cognition events ───
    case 'cognition.signal_emitted':
    case 'cognition.pattern_detected':
    case 'cognition.knowledge_updated':
      handleCognitionEvent(event);
      break;
    case 'cognition.decision_required':
      handleDecisionRequired(payload);
      break;

    default:
      // Unknown event type — log for debugging
      console.debug('[EventHandler] Unhandled event type:', event_type);
  }
}

function handleTaskCreated(payload: Record<string, unknown>): void {
  const mapStore = useMapStore.getState();
  const taskId = payload.task_id as string;
  const title = (payload.title as string) || 'New Task';

  // Add a new task node to the map
  mapStore.addNode({
    id: taskId,
    type: 'taskNode',
    position: { x: 300, y: 300 },
    data: {
      label: title,
      description: payload.description as string | undefined,
      nodeType: 'task',
      layer: 'execution',
      taskStatus: 'gray',
      isDraft: true,
    },
  });
}

function handleTaskStatusChange(
  payload: Record<string, unknown>,
  state: TaskState,
): void {
  const taskId = payload.task_id as string;
  if (!taskId) return;

  useMapStore.getState().updateNodeStatus(taskId, state);
}

function handleWorkflowEvent(event: ClawTeamsEvent): void {
  // Workflow events can update multiple nodes — for now, log them
  // and handle the step-level updates via task events
  const payload = event.payload;
  const workflowId = payload.workflow_id as string;

  if (event.event_type === 'workflow.failed') {
    // Add a system message to the active conversation
    const chatStore = useChatStore.getState();
    const activeId = chatStore.activeConversationId;
    if (activeId) {
      chatStore.addMessage(activeId, {
        id: `sys-${Date.now()}`,
        conversationId: activeId,
        senderId: 'brain',
        senderName: 'ClawTeams 大脑',
        senderType: 'brain',
        content: `工作流 ${workflowId} 执行失败。请检查相关任务状态。`,
        timestamp: new Date().toISOString(),
        semanticType: 'normal',
        actions: [],
      });
    }
  }
}

function handleIntentGraphUpdated(payload: Record<string, unknown>): void {
  // The payload should contain updated nodes and edges
  // In production, we'd refetch the graph from the API
  console.debug('[EventHandler] Intent graph updated:', payload);
}

function handleGoalCreated(payload: Record<string, unknown>): void {
  const mapStore = useMapStore.getState();
  const goalId = payload.goal_id as string;
  const title = (payload.title as string) || 'New Goal';

  mapStore.addNode({
    id: goalId,
    type: 'goalNode',
    position: { x: 400, y: 50 },
    data: {
      label: title,
      description: payload.description as string | undefined,
      nodeType: 'goal',
      layer: 'orchestration',
      isDraft: true,
    },
  });
}

function handleDecomposed(payload: Record<string, unknown>): void {
  // Goal was decomposed — fetch the new subgraph from API
  console.debug('[EventHandler] Goal decomposed:', payload);
}

function handleCognitionEvent(event: ClawTeamsEvent): void {
  const payload = event.payload;
  const mapStore = useMapStore.getState();

  // Add a cognition node to the map
  const nodeId = (payload.signal_id as string) || `cog-${Date.now()}`;
  mapStore.addNode({
    id: nodeId,
    type: 'cognitionNode',
    position: { x: 300, y: 600 },
    data: {
      label: (payload.pattern_description as string) || '认知信号',
      nodeType: 'cognition',
      layer: 'cognition',
      cognitionState: 'hypothesis',
      isDraft: true,
    },
  });
}

function handleDecisionRequired(payload: Record<string, unknown>): void {
  const chatStore = useChatStore.getState();
  const activeId = chatStore.activeConversationId;
  if (activeId) {
    chatStore.addMessage(activeId, {
      id: `decision-${Date.now()}`,
      conversationId: activeId,
      senderId: 'brain',
      senderName: 'ClawTeams 大脑',
      senderType: 'brain',
      content: `需要人工决策：${(payload.description as string) || '请查看详情'}`,
      timestamp: new Date().toISOString(),
      semanticType: 'conflict',
      actions: ['decision'],
    });
  }
}
