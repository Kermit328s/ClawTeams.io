/**
 * 图谱解析器单元测试
 */

import {
  parseIntentGraph,
  buildAdjacencyList,
  buildReverseAdjacencyList,
  detectCycles,
  topologicalSort,
} from '../../src/workflow/parser';
import {
  resetIdCounter,
  makeSequentialGraph,
  makeParallelGraph,
  makeLoopGraph,
  makeGoalNode,
  makeTaskNode,
  makeHumanNode,
  makeDecisionNode,
  makeEdge,
  makeSubGraph,
} from './helpers';

beforeEach(() => resetIdCounter());

describe('parseIntentGraph', () => {
  describe('顺序链路', () => {
    it('正确解析顺序依赖图', () => {
      const graph = makeSequentialGraph();
      const dag = parseIntentGraph(graph);

      expect(dag.goal_id).toBe('goal_1');
      expect(dag.nodes).toHaveLength(4);
      expect(dag.edges).toHaveLength(3);
      expect(dag.has_cycles).toBe(false);
      expect(dag.cycles).toHaveLength(0);
    });

    it('拓扑排序保持依赖顺序', () => {
      const graph = makeSequentialGraph();
      const dag = parseIntentGraph(graph);

      const order = dag.topological_order;
      expect(order.indexOf('goal_1')).toBeLessThan(order.indexOf('task_a'));
      expect(order.indexOf('task_a')).toBeLessThan(order.indexOf('task_b'));
      expect(order.indexOf('task_b')).toBeLessThan(order.indexOf('task_c'));
    });

    it('入口节点是 goal，出口节点是 task_c', () => {
      const graph = makeSequentialGraph();
      const dag = parseIntentGraph(graph);

      expect(dag.entry_nodes).toEqual(['goal_1']);
      expect(dag.exit_nodes).toEqual(['task_c']);
    });

    it('关键路径包含首尾节点', () => {
      const graph = makeSequentialGraph();
      const dag = parseIntentGraph(graph);

      expect(dag.critical_path.length).toBeGreaterThanOrEqual(2);
      expect(dag.critical_path).toContain('goal_1');
      expect(dag.critical_path).toContain('task_c');
    });
  });

  describe('并行链路', () => {
    it('正确解析并行图', () => {
      const graph = makeParallelGraph();
      const dag = parseIntentGraph(graph);

      expect(dag.nodes).toHaveLength(4);
      expect(dag.has_cycles).toBe(false);
    });

    it('入口节点是 goal，出口节点是 task_c', () => {
      const graph = makeParallelGraph();
      const dag = parseIntentGraph(graph);

      expect(dag.entry_nodes).toEqual(['goal_1']);
      expect(dag.exit_nodes).toEqual(['task_c']);
    });

    it('task_a 和 task_b 在拓扑序中位于 goal 之后、task_c 之前', () => {
      const graph = makeParallelGraph();
      const dag = parseIntentGraph(graph);

      const order = dag.topological_order;
      expect(order.indexOf('goal_1')).toBeLessThan(order.indexOf('task_a'));
      expect(order.indexOf('goal_1')).toBeLessThan(order.indexOf('task_b'));
      expect(order.indexOf('task_a')).toBeLessThan(order.indexOf('task_c'));
      expect(order.indexOf('task_b')).toBeLessThan(order.indexOf('task_c'));
    });
  });

  describe('回环链路', () => {
    it('正确检测回环', () => {
      const graph = makeLoopGraph();
      const dag = parseIntentGraph(graph);

      expect(dag.has_cycles).toBe(true);
      expect(dag.cycles.length).toBeGreaterThanOrEqual(1);
    });

    it('拓扑排序忽略 LOOP_BACK 边后正常工作', () => {
      const graph = makeLoopGraph();
      const dag = parseIntentGraph(graph);

      expect(dag.topological_order).toHaveLength(4);
    });

    it('LOOP_BACK 边保留在 edges 中', () => {
      const graph = makeLoopGraph();
      const dag = parseIntentGraph(graph);

      const loopEdges = dag.edges.filter((e) => e.edge_type === 'LOOP_BACK');
      expect(loopEdges).toHaveLength(1);
      expect(loopEdges[0].from_id).toBe('task_qc');
      expect(loopEdges[0].to_id).toBe('human_shoot');
    });
  });

  describe('节点类型识别', () => {
    it('正确转换 Task 节点的能力要求', () => {
      const graph = makeSequentialGraph();
      const dag = parseIntentGraph(graph);

      const taskA = dag.nodes.find((n) => n.id === 'task_a');
      expect(taskA?.required_capabilities).toEqual(['video_capture']);
      expect(taskA?.estimated_duration_minutes).toBe(30);
    });

    it('正确转换 Human 节点', () => {
      const graph = makeLoopGraph();
      const dag = parseIntentGraph(graph);

      const human = dag.nodes.find((n) => n.id === 'human_shoot');
      expect(human?.type).toBe('Human');
      expect(human?.label).toBe('拍摄');
      expect(human?.human_description).toBe('按要求拍摄视频');
    });

    it('正确转换 Decision 节点', () => {
      resetIdCounter();
      const goal = makeGoalNode({ id: 'g1' });
      const decision = makeDecisionNode({
        id: 'd1',
        question: '质检是否通过？',
        options: [
          { id: 'pass', label: '通过' },
          { id: 'fail', label: '不通过' },
        ],
      });
      const graph = makeSubGraph([goal, decision], [
        makeEdge('g1', 'd1', 'DEPENDS_ON', { id: 'e1' }),
      ], 'g1');

      const dag = parseIntentGraph(graph);
      const d = dag.nodes.find((n) => n.id === 'd1');
      expect(d?.type).toBe('Decision');
      expect(d?.label).toBe('质检是否通过？');
      expect(d?.decision_options).toHaveLength(2);
    });
  });

  describe('过滤非工作流节点', () => {
    it('过滤掉 Agent 等组织结构节点', () => {
      resetIdCounter();
      const goal = makeGoalNode({ id: 'g1' });
      const task = makeTaskNode({ id: 't1' });
      const agentNode = {
        id: 'a1',
        type: 'Agent' as const,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const graph = makeSubGraph(
        [goal, task] as any,
        [makeEdge('g1', 't1', 'DEPENDS_ON', { id: 'e1' })],
        'g1',
      );
      graph.nodes.push(agentNode);

      const dag = parseIntentGraph(graph);
      expect(dag.nodes.find((n) => n.id === 'a1')).toBeUndefined();
      expect(dag.nodes).toHaveLength(2);
    });
  });
});

describe('buildAdjacencyList / buildReverseAdjacencyList', () => {
  it('正向邻接表正确', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const adj = buildAdjacencyList(dag.nodes, dag.edges);

    expect(adj.get('goal_1')?.map((e) => e.to_id)).toEqual(['task_a']);
    expect(adj.get('task_a')?.map((e) => e.to_id)).toEqual(['task_b']);
    expect(adj.get('task_c')?.length).toBe(0);
  });

  it('反向邻接表正确', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const rev = buildReverseAdjacencyList(dag.nodes, dag.edges);

    expect(rev.get('goal_1')?.length).toBe(0);
    expect(rev.get('task_b')?.map((e) => e.from_id)).toEqual(['task_a']);
    expect(rev.get('task_c')?.map((e) => e.from_id)).toEqual(['task_b']);
  });
});

describe('detectCycles', () => {
  it('无环图返回空数组', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const adj = buildAdjacencyList(dag.nodes, dag.edges);
    const cycles = detectCycles(dag.nodes, adj);
    expect(cycles).toHaveLength(0);
  });

  it('有环图检测到环', () => {
    const graph = makeLoopGraph();
    const dag = parseIntentGraph(graph);
    const adj = buildAdjacencyList(dag.nodes, dag.edges);
    const cycles = detectCycles(dag.nodes, adj);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });
});

describe('topologicalSort', () => {
  it('空图返回空数组', () => {
    const result = topologicalSort([], [], new Map(), false);
    expect(result).toEqual([]);
  });

  it('单节点返回该节点', () => {
    resetIdCounter();
    const goal = makeGoalNode({ id: 'g1' });
    const graph = makeSubGraph(goal, [], 'g1');
    const dag = parseIntentGraph(graph);
    expect(dag.topological_order).toEqual(['g1']);
  });
});
