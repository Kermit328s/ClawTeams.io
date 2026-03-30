/**
 * 测试辅助工具：创建测试用的意图图谱和龙虾数据
 */

import type {
  IntentSubGraph,
  GoalNode,
  TaskNode,
  DecisionNode,
  HumanNode,
  GraphEdge,
  AgentIdentity,
  AgentCapability,
} from '../../src/infra/shared';

let _idCounter = 0;
function nextId(prefix = 'test'): string {
  return `${prefix}_${++_idCounter}`;
}

export function resetIdCounter(): void {
  _idCounter = 0;
}

const NOW = '2026-03-29T00:00:00.000Z';

export function makeGoalNode(overrides: Partial<GoalNode> = {}): GoalNode {
  return {
    id: nextId('goal'),
    type: 'Goal',
    title: 'Test Goal',
    status: 'active',
    priority: 'medium',
    team_id: 'team_1',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function makeTaskNode(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: nextId('task'),
    type: 'Task',
    title: 'Test Task',
    task_type: 'generic',
    state: 'pending',
    priority: 'medium',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function makeDecisionNode(overrides: Partial<DecisionNode> = {}): DecisionNode {
  return {
    id: nextId('decision'),
    type: 'Decision',
    question: 'Which option?',
    options: [
      { id: 'opt_a', label: 'Option A' },
      { id: 'opt_b', label: 'Option B' },
    ],
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function makeHumanNode(overrides: Partial<HumanNode> = {}): HumanNode {
  return {
    id: nextId('human'),
    type: 'Human',
    title: 'Human Review',
    description: 'Needs human review',
    required_by_task_id: 'task_placeholder',
    resolved: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function makeEdge(
  from_id: string,
  to_id: string,
  edge_type: GraphEdge['edge_type'] = 'DEPENDS_ON',
  overrides: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id: nextId('edge'),
    from_id,
    to_id,
    edge_type,
    created_at: NOW,
    ...overrides,
  };
}

export function makeSubGraph(
  nodes: GoalNode | TaskNode | DecisionNode | HumanNode | (GoalNode | TaskNode | DecisionNode | HumanNode)[],
  edges: GraphEdge[],
  goalId?: string,
): IntentSubGraph {
  const nodeArray = Array.isArray(nodes) ? nodes : [nodes];
  return {
    goal_id: goalId ?? nodeArray.find((n) => n.type === 'Goal')?.id ?? 'goal_default',
    nodes: nodeArray,
    edges,
    version: 1,
  };
}

export function makeAgent(overrides: Partial<AgentIdentity> = {}): AgentIdentity {
  const id = nextId('agent');
  return {
    agent_id: id,
    name: `Agent ${id}`,
    team_id: 'team_1',
    status: 'online',
    capabilities: [],
    roles: ['agent_worker'],
    api_key_hash: 'hash',
    api_key_prefix: 'ct_',
    created_at: NOW,
    ...overrides,
  };
}

export function makeCapability(name: string): AgentCapability {
  return {
    name,
    version: '1.0',
    description: `Capability: ${name}`,
  };
}

/**
 * 场景：简单顺序链 Goal → A → B → C
 */
export function makeSequentialGraph() {
  resetIdCounter();
  const goal = makeGoalNode({ id: 'goal_1', title: '视频制作' });
  const taskA = makeTaskNode({
    id: 'task_a',
    title: '拍摄',
    task_type: 'video_capture',
    metadata: { required_capabilities: ['video_capture'], estimated_duration_minutes: 30 },
  });
  const taskB = makeTaskNode({
    id: 'task_b',
    title: '剪辑',
    task_type: 'video_edit',
    metadata: { required_capabilities: ['video_edit'], estimated_duration_minutes: 60 },
  });
  const taskC = makeTaskNode({
    id: 'task_c',
    title: '发布',
    task_type: 'publish',
    metadata: { required_capabilities: ['publish'], estimated_duration_minutes: 10 },
  });

  const edges = [
    makeEdge('goal_1', 'task_a', 'DEPENDS_ON', { id: 'e1' }),
    makeEdge('task_a', 'task_b', 'DEPENDS_ON', { id: 'e2' }),
    makeEdge('task_b', 'task_c', 'DEPENDS_ON', { id: 'e3' }),
  ];

  return makeSubGraph([goal, taskA, taskB, taskC], edges, 'goal_1');
}

/**
 * 场景：并行 Goal → [A, B] → C（聚合）
 */
export function makeParallelGraph() {
  resetIdCounter();
  const goal = makeGoalNode({ id: 'goal_1', title: '多平台分发' });
  const taskA = makeTaskNode({
    id: 'task_a',
    title: '抖音分发',
    task_type: 'distribute',
    metadata: { required_capabilities: ['distribute'], estimated_duration_minutes: 15 },
  });
  const taskB = makeTaskNode({
    id: 'task_b',
    title: '小红书分发',
    task_type: 'distribute',
    metadata: { required_capabilities: ['distribute'], estimated_duration_minutes: 15 },
  });
  const taskC = makeTaskNode({
    id: 'task_c',
    title: '数据汇总',
    task_type: 'analytics',
    metadata: { required_capabilities: ['analytics'], estimated_duration_minutes: 20 },
  });

  const edges = [
    makeEdge('goal_1', 'task_a', 'DEPENDS_ON', { id: 'e1' }),
    makeEdge('goal_1', 'task_b', 'DEPENDS_ON', { id: 'e2' }),
    makeEdge('task_a', 'task_b', 'PARALLEL_WITH', { id: 'e3' }),
    makeEdge('task_a', 'task_c', 'AGGREGATES', { id: 'e4' }),
    makeEdge('task_b', 'task_c', 'AGGREGATES', { id: 'e5' }),
  ];

  return makeSubGraph([goal, taskA, taskB, taskC], edges, 'goal_1');
}

/**
 * 场景：含回环 Goal → Human(拍摄) → Task(质检) --LOOP_BACK→ Human(拍摄) → Task(剪辑)
 */
export function makeLoopGraph() {
  resetIdCounter();
  const goal = makeGoalNode({ id: 'goal_1', title: '视频质检流程' });
  const humanShoot = makeHumanNode({
    id: 'human_shoot',
    title: '拍摄',
    description: '按要求拍摄视频',
    required_by_task_id: 'task_qc',
  });
  const taskQC = makeTaskNode({
    id: 'task_qc',
    title: '质检',
    task_type: 'quality_check',
    metadata: { required_capabilities: ['quality_check'], estimated_duration_minutes: 5 },
  });
  const taskEdit = makeTaskNode({
    id: 'task_edit',
    title: '剪辑',
    task_type: 'video_edit',
    metadata: { required_capabilities: ['video_edit'], estimated_duration_minutes: 45 },
  });

  const edges = [
    makeEdge('goal_1', 'human_shoot', 'DEPENDS_ON', { id: 'e1' }),
    makeEdge('human_shoot', 'task_qc', 'DEPENDS_ON', { id: 'e2' }),
    makeEdge('task_qc', 'human_shoot', 'LOOP_BACK', { id: 'e3', condition_expr: "result.status === 'rejected'" }),
    makeEdge('task_qc', 'task_edit', 'DEPENDS_ON', { id: 'e4' }),
  ];

  return makeSubGraph([goal, humanShoot, taskQC, taskEdit], edges, 'goal_1');
}
