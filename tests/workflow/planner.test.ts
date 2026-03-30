/**
 * 执行策略引擎单元测试
 */

import {
  matchCapability,
  identifyParallelStages,
  identifyRisks,
  generateExecutionPlan,
} from '../../src/workflow/planner';
import { parseIntentGraph } from '../../src/workflow/parser';
import {
  resetIdCounter,
  makeSequentialGraph,
  makeParallelGraph,
  makeLoopGraph,
  makeAgent,
  makeCapability,
} from './helpers';
import type { WorkflowNode } from '../../src/workflow/types';

beforeEach(() => resetIdCounter());

describe('matchCapability', () => {
  it('匹配拥有所需能力的龙虾', () => {
    const node: WorkflowNode = {
      id: 'task_1',
      type: 'Task',
      label: '视频剪辑',
      required_capabilities: ['video_edit'],
    };

    const agent1 = makeAgent({
      agent_id: 'a1',
      capabilities: [makeCapability('video_edit')],
      status: 'online',
    });
    const agent2 = makeAgent({
      agent_id: 'a2',
      capabilities: [makeCapability('analytics')],
      status: 'online',
    });

    const result = matchCapability(node, [agent1, agent2]);
    expect(result).not.toBeNull();
    expect(result!.agent.agent_id).toBe('a1');
    expect(result!.matched).toEqual(['video_edit']);
    expect(result!.confidence).toBe(1.0);
  });

  it('选择匹配度最高的龙虾', () => {
    const node: WorkflowNode = {
      id: 'task_1',
      type: 'Task',
      label: '复杂任务',
      required_capabilities: ['video_edit', 'color_grading', 'audio_mix'],
    };

    const agent1 = makeAgent({
      agent_id: 'a1',
      capabilities: [makeCapability('video_edit')],
      status: 'online',
    });
    const agent2 = makeAgent({
      agent_id: 'a2',
      capabilities: [
        makeCapability('video_edit'),
        makeCapability('color_grading'),
        makeCapability('audio_mix'),
      ],
      status: 'online',
    });

    const result = matchCapability(node, [agent1, agent2]);
    expect(result!.agent.agent_id).toBe('a2');
    expect(result!.confidence).toBe(1.0);
  });

  it('排除离线龙虾', () => {
    const node: WorkflowNode = {
      id: 'task_1',
      type: 'Task',
      label: '任务',
      required_capabilities: ['video_edit'],
    };

    const offlineAgent = makeAgent({
      agent_id: 'a1',
      capabilities: [makeCapability('video_edit')],
      status: 'offline',
    });

    const result = matchCapability(node, [offlineAgent]);
    expect(result).toBeNull();
  });

  it('Human 节点返回 null', () => {
    const node: WorkflowNode = {
      id: 'h1',
      type: 'Human',
      label: '人工审核',
    };

    const agent = makeAgent({ capabilities: [makeCapability('anything')] });
    expect(matchCapability(node, [agent])).toBeNull();
  });

  it('无能力要求时返回第一个在线龙虾', () => {
    const node: WorkflowNode = {
      id: 'task_1',
      type: 'Task',
      label: '通用任务',
      required_capabilities: [],
    };

    const agent = makeAgent({ agent_id: 'a1', status: 'online' });
    const result = matchCapability(node, [agent]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.5);
  });

  it('没有匹配的龙虾返回 null', () => {
    const node: WorkflowNode = {
      id: 'task_1',
      type: 'Task',
      label: '特殊任务',
      required_capabilities: ['rare_skill'],
    };

    const agent = makeAgent({
      capabilities: [makeCapability('common_skill')],
      status: 'online',
    });
    expect(matchCapability(node, [agent])).toBeNull();
  });
});

describe('identifyParallelStages', () => {
  it('顺序链路每阶段只有一个节点', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const stages = identifyParallelStages(dag);

    expect(stages.length).toBe(4);
    stages.forEach((stage) => {
      expect(stage).toHaveLength(1);
    });
  });

  it('并行图中间阶段有多个节点', () => {
    const graph = makeParallelGraph();
    const dag = parseIntentGraph(graph);
    const stages = identifyParallelStages(dag);

    expect(stages.length).toBe(3);
    expect(stages[0]).toEqual(['goal_1']);

    const middleStage = stages[1];
    expect(middleStage).toHaveLength(2);
    expect(middleStage).toContain('task_a');
    expect(middleStage).toContain('task_b');

    expect(stages[2]).toEqual(['task_c']);
  });

  it('回环图正确分阶段', () => {
    const graph = makeLoopGraph();
    const dag = parseIntentGraph(graph);
    const stages = identifyParallelStages(dag);

    expect(stages.length).toBeGreaterThanOrEqual(3);
  });
});

describe('identifyRisks', () => {
  it('标记关键路径上无可用龙虾的节点', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);

    const risks = identifyRisks(dag, []);
    const noAgent = risks.filter((r) => r.type === 'no_capable_agent');
    expect(noAgent.length).toBeGreaterThan(0);
  });

  it('标记单点故障', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);

    const agent = makeAgent({
      agent_id: 'lonely_agent',
      capabilities: [
        makeCapability('video_capture'),
        makeCapability('video_edit'),
        makeCapability('publish'),
      ],
      status: 'online',
    });

    const risks = identifyRisks(dag, [agent]);
    const spof = risks.filter((r) => r.type === 'single_point_of_failure');
    expect(spof.length).toBeGreaterThan(0);
  });
});

describe('generateExecutionPlan', () => {
  it('生成包含所有阶段的执行计划', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const agents = [
      makeAgent({
        agent_id: 'a1',
        capabilities: [
          makeCapability('video_capture'),
          makeCapability('video_edit'),
          makeCapability('publish'),
        ],
        status: 'online',
      }),
    ];

    const plan = generateExecutionPlan(dag, agents);

    expect(plan.goal_id).toBe('goal_1');
    expect(plan.stages.length).toBeGreaterThanOrEqual(1);
    expect(plan.estimated_total_minutes).toBeGreaterThan(0);
  });

  it('并行阶段被正确标记', () => {
    const graph = makeParallelGraph();
    const dag = parseIntentGraph(graph);
    const agents = [
      makeAgent({
        agent_id: 'a1',
        capabilities: [makeCapability('distribute'), makeCapability('analytics')],
        status: 'online',
      }),
    ];

    const plan = generateExecutionPlan(dag, agents);
    const parallelStages = plan.stages.filter((s) => s.parallel);
    expect(parallelStages.length).toBeGreaterThanOrEqual(1);
  });

  it('Human 节点标记为 is_human', () => {
    const graph = makeLoopGraph();
    const dag = parseIntentGraph(graph);
    const agents = [
      makeAgent({
        capabilities: [makeCapability('quality_check'), makeCapability('video_edit')],
        status: 'online',
      }),
    ];

    const plan = generateExecutionPlan(dag, agents);
    const allAssignments = plan.stages.flatMap((s) => s.assignments);
    const humanAssignment = allAssignments.find((a) => a.node_id === 'human_shoot');
    expect(humanAssignment?.is_human).toBe(true);
  });

  it('无可用龙虾时标记 unassigned', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);

    const plan = generateExecutionPlan(dag, []);
    const allAssignments = plan.stages.flatMap((s) => s.assignments);
    const taskAssignments = allAssignments.filter(
      (a) => !a.is_human && a.assigned_agent_name !== 'system',
    );
    for (const a of taskAssignments) {
      expect(a.assigned_agent_name).toBe('unassigned');
      expect(a.match_confidence).toBe(0);
    }
  });

  it('包含风险评估', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const plan = generateExecutionPlan(dag, []);

    expect(plan.risks.length).toBeGreaterThan(0);
  });
});
