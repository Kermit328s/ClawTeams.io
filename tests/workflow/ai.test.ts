/**
 * AI 驱动链路单元测试
 */

import { validateIntentGraph, checkConsistency, IntentParser } from '../../src/workflow/ai';
import type { IntentSubGraph } from '../../src/infra/shared';
import type { AIProvider, NaturalLanguageIntent, StructuredIntent, WorkflowDAG, ExecutionPlan } from '../../src/workflow/types';
import type { AgentIdentity } from '../../src/infra/shared';
import { resetIdCounter, makeGoalNode, makeTaskNode, makeEdge, makeSubGraph } from './helpers';

beforeEach(() => resetIdCounter());

function makeValidGraph(): IntentSubGraph {
  const goal = makeGoalNode({ id: 'g1' });
  const task = makeTaskNode({ id: 't1' });
  return makeSubGraph([goal, task], [makeEdge('g1', 't1', 'DEPENDS_ON', { id: 'e1' })], 'g1');
}

describe('validateIntentGraph', () => {
  it('有效图谱无错误', () => {
    const graph = makeValidGraph();
    const errors = validateIntentGraph(graph);
    expect(errors.filter((e) => e.severity === 'error')).toHaveLength(0);
  });

  it('缺少 goal_id 报错', () => {
    const graph = makeValidGraph();
    graph.goal_id = '';
    const errors = validateIntentGraph(graph);
    expect(errors.some((e) => e.field === 'goal_id')).toBe(true);
  });

  it('version < 1 报错', () => {
    const graph = makeValidGraph();
    graph.version = 0;
    const errors = validateIntentGraph(graph);
    expect(errors.some((e) => e.field === 'version')).toBe(true);
  });

  it('重复节点 ID 报错', () => {
    const goal = makeGoalNode({ id: 'dup' });
    const task = makeTaskNode({ id: 'dup' });
    const graph = makeSubGraph([goal, task], [], 'dup');
    const errors = validateIntentGraph(graph);
    expect(errors.some((e) => e.message.includes('重复'))).toBe(true);
  });

  it('边引用不存在的节点报错', () => {
    const goal = makeGoalNode({ id: 'g1' });
    const graph = makeSubGraph(
      [goal] as any,
      [makeEdge('g1', 'nonexistent', 'DEPENDS_ON', { id: 'e1' })],
      'g1',
    );
    const errors = validateIntentGraph(graph);
    expect(errors.some((e) => e.message.includes('不存在'))).toBe(true);
  });

  it('CONDITION 边无 condition_expr 警告', () => {
    const goal = makeGoalNode({ id: 'g1' });
    const task = makeTaskNode({ id: 't1' });
    const graph = makeSubGraph(
      [goal, task],
      [makeEdge('g1', 't1', 'CONDITION', { id: 'e1' })],
      'g1',
    );
    const errors = validateIntentGraph(graph);
    expect(errors.some((e) => e.severity === 'warning' && e.message.includes('条件表达式'))).toBe(true);
  });
});

describe('checkConsistency', () => {
  it('有效图谱通过一致性检查', () => {
    const graph = makeValidGraph();
    const errors = checkConsistency(graph);
    expect(errors.filter((e) => e.severity === 'error')).toHaveLength(0);
  });

  it('无 Goal 节点报错', () => {
    const task1 = makeTaskNode({ id: 't1' });
    const task2 = makeTaskNode({ id: 't2' });
    const graph: IntentSubGraph = {
      goal_id: 'missing',
      nodes: [task1, task2],
      edges: [makeEdge('t1', 't2', 'DEPENDS_ON', { id: 'e1' })],
      version: 1,
    };
    const errors = checkConsistency(graph);
    expect(errors.some((e) => e.message.includes('Goal'))).toBe(true);
  });

  it('LOOP_BACK 自环报错', () => {
    const goal = makeGoalNode({ id: 'g1' });
    const task = makeTaskNode({ id: 't1' });
    const graph = makeSubGraph(
      [goal, task],
      [
        makeEdge('g1', 't1', 'DEPENDS_ON', { id: 'e1' }),
        makeEdge('t1', 't1', 'LOOP_BACK', { id: 'e2' }),
      ],
      'g1',
    );
    const errors = checkConsistency(graph);
    expect(errors.some((e) => e.message.includes('自环'))).toBe(true);
  });

  it('不可达 Task 节点警告', () => {
    const goal = makeGoalNode({ id: 'g1' });
    const task1 = makeTaskNode({ id: 't1' });
    const task2 = makeTaskNode({ id: 't2' });
    const graph: IntentSubGraph = {
      goal_id: 'g1',
      nodes: [goal, task1, task2],
      edges: [makeEdge('g1', 't1', 'DEPENDS_ON', { id: 'e1' })],
      version: 1,
    };
    const errors = checkConsistency(graph);
    expect(errors.some((e) => e.message.includes('不可达') && e.message.includes('t2'))).toBe(true);
  });
});

describe('IntentParser', () => {
  it('调用 AI provider 并执行验证', async () => {
    const validGraph = makeValidGraph();
    const mockProvider: AIProvider = {
      parseIntent: async (_input: NaturalLanguageIntent): Promise<StructuredIntent> => ({
        graph: validGraph,
        confidence: 0.9,
        explanation: 'Parsed successfully',
        needs_confirmation: false,
      }),
      suggestPlan: async (_dag: WorkflowDAG, _agents: AgentIdentity[]): Promise<ExecutionPlan> => {
        throw new Error('Not used in this test');
      },
    };

    const parser = new IntentParser(mockProvider);
    const result = await parser.parse({
      raw_input: '制作一个营销视频',
      context: { team_id: 'team_1', user_id: 'user_1' },
    });

    expect(result.intent.confidence).toBe(0.9);
    expect(result.validationErrors.filter((e) => e.severity === 'error')).toHaveLength(0);
    expect(result.consistencyErrors.filter((e) => e.severity === 'error')).toHaveLength(0);
  });

  it('有错误时标记 needs_confirmation', async () => {
    const badGraph: IntentSubGraph = {
      goal_id: '',
      nodes: [],
      edges: [],
      version: 0,
    };

    const mockProvider: AIProvider = {
      parseIntent: async () => ({
        graph: badGraph,
        confidence: 0.3,
        explanation: 'Low confidence parse',
        needs_confirmation: false,
      }),
      suggestPlan: async () => {
        throw new Error('Not used');
      },
    };

    const parser = new IntentParser(mockProvider);
    const result = await parser.parse({
      raw_input: '???',
      context: { team_id: 'team_1', user_id: 'user_1' },
    });

    expect(result.intent.needs_confirmation).toBe(true);
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });
});
