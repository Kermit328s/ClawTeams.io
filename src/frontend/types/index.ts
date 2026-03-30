/**
 * Frontend-specific type definitions.
 * Re-exports shared types and adds UI-layer types.
 */

export type {
  ClawTeamsEvent,
  EventType,
  EventHandler,
} from '@shared/events';

export type {
  IntentNode,
  GoalNode,
  TaskNode,
  DecisionNode,
  HumanNode,
  CognitionNode,
  GraphEdge,
  IntentSubGraph,
  TaskState,
  GoalStatus,
  Priority,
  IntentEdgeType,
} from '@shared/intent-graph';

// ─── Chat Types ───

export type ConversationType = 'human-brain' | 'two-person' | 'group';

export type MessageSemanticType =
  | 'normal'
  | 'intent'
  | 'cognition'
  | 'both'
  | 'conflict';

export type BubbleAction = 'execute' | 'cognition' | 'decision';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderType: 'human' | 'brain';
  content: string;
  timestamp: string;
  semanticType: MessageSemanticType;
  /** Available actions based on semantic type */
  actions: BubbleAction[];
  /** If this message was converted to execution, track the state */
  executionState?: ExecutionCardState;
}

export interface ExecutionCardState {
  status: 'executing' | 'pending_confirm' | 'completed' | 'failed';
  title: string;
  description: string;
  taskId?: string;
  details?: string;
  confirmActions?: { label: string; action: string }[];
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  participants: Participant[];
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export interface Participant {
  id: string;
  name: string;
  type: 'human' | 'brain';
  avatar?: string;
}

// ─── Map Types ───

export type MapNodeType =
  | 'goal'
  | 'task'
  | 'decision'
  | 'human'
  | 'cognition'
  | 'draft';

export type MapLayer = 'generation' | 'orchestration' | 'execution' | 'cognition';

export type TaskColorStatus = 'gray' | 'blue' | 'green' | 'red' | 'yellow';

export type CognitionVisualState =
  | 'hypothesis'     // orange dashed
  | 'disproved'      // red solid
  | 'verified'       // green solid
  | 'iterating';     // purple dashed

export type MapEdgeType = 'sequence' | 'parallel' | 'condition' | 'aggregate' | 'loop';

export interface MapNodeData {
  label: string;
  description?: string;
  nodeType: MapNodeType;
  layer: MapLayer;
  taskStatus?: TaskColorStatus;
  cognitionState?: CognitionVisualState;
  isDraft?: boolean;
  /** Source shared type node */
  sourceNode?: IntentNode;
}

// ─── Onboarding Types ───

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export interface VisionInput {
  rawText: string;
  structuredGoals?: Array<{ title: string; description: string }>;
}

// ─── Impact Preview ───

export interface ImpactPreview {
  affectedProjects: number;
  affectedDepartments: number;
  affectedMilestones: number;
  details: string[];
}
