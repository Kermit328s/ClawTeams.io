/**
 * Temporal 代码生成器单元测试
 */

import { compileWorkflow } from '../../src/workflow/compiler';
import { parseIntentGraph } from '../../src/workflow/parser';
import { generateExecutionPlan } from '../../src/workflow/planner';
import {
  resetIdCounter,
  makeSequentialGraph,
  makeParallelGraph,
  makeLoopGraph,
} from './helpers';

const agents = [
  {
    agent_id: 'a1',
    name: 'Worker 1',
    team_id: 'team_1',
    status: 'online' as const,
    capabilities: [
      { name: 'video_capture', version: '1.0' },
      { name: 'video_edit', version: '1.0' },
      { name: 'publish', version: '1.0' },
      { name: 'quality_check', version: '1.0' },
      { name: 'distribute', version: '1.0' },
      { name: 'analytics', version: '1.0' },
    ],
    roles: ['agent_worker'],
    api_key_hash: 'hash',
    api_key_prefix: 'ct_',
    created_at: '2026-01-01T00:00:00Z',
  },
];

beforeEach(() => resetIdCounter());

describe('compileWorkflow', () => {
  it('顺序链路生成包含 await 的代码', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const plan = generateExecutionPlan(dag, agents);
    const compiled = compileWorkflow(dag, plan);

    expect(compiled.workflow_name).toContain('ClawTeamsWorkflow');
    expect(compiled.workflow_code).toContain('activities.executeTask');
    expect(compiled.workflow_code).toContain('import { proxyActivities');
    expect(compiled.activities_code).toContain('TaskActivities');
    expect(compiled.worker_code).toContain('Worker');
  });

  it('并行链路生成 Promise.all', () => {
    const graph = makeParallelGraph();
    const dag = parseIntentGraph(graph);
    const plan = generateExecutionPlan(dag, agents);
    const compiled = compileWorkflow(dag, plan);

    expect(compiled.workflow_code).toContain('Promise.all');
  });

  it('Human 节点生成信号定义', () => {
    const graph = makeLoopGraph();
    const dag = parseIntentGraph(graph);
    const plan = generateExecutionPlan(dag, agents);
    const compiled = compileWorkflow(dag, plan);

    expect(compiled.signal_definitions.length).toBeGreaterThanOrEqual(1);
    expect(compiled.signal_definitions[0].node_id).toBe('human_shoot');
    expect(compiled.workflow_code).toContain('defineSignal');
    expect(compiled.workflow_code).toContain('condition');
  });

  it('回环链路生成 while 循环', () => {
    const graph = makeLoopGraph();
    const dag = parseIntentGraph(graph);
    const plan = generateExecutionPlan(dag, agents);
    const compiled = compileWorkflow(dag, plan);

    expect(compiled.workflow_code).toContain('while');
  });

  it('Activities 代码包含 createActivities 工厂', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const plan = generateExecutionPlan(dag, agents);
    const compiled = compileWorkflow(dag, plan);

    expect(compiled.activities_code).toContain('createActivities');
    expect(compiled.activities_code).toContain('executeTask');
  });

  it('Worker 代码引用正确的 taskQueue', () => {
    const graph = makeSequentialGraph();
    const dag = parseIntentGraph(graph);
    const plan = generateExecutionPlan(dag, agents);
    const compiled = compileWorkflow(dag, plan);

    expect(compiled.worker_code).toContain(compiled.task_queue);
  });
});
