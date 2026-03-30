/**
 * Temporal 代码生成器（Workflow Compiler）
 * 将执行计划编译为 Temporal Workflow 定义
 *
 * 翻译规则：
 *   图谱节点   → Temporal Activity
 *   顺序依赖   → await activity
 *   并行关系   → Promise.all
 *   条件依赖   → if/else 分支
 *   聚合关系   → 等待所有完成
 *   人工节点   → Temporal Signal（暂停等待）
 *   回环关系   → 条件循环
 */

import type {
  WorkflowDAG,
  WorkflowNode,
  WorkflowEdge,
  ExecutionPlan,
  CompiledWorkflow,
  SignalDefinition,
} from '../types';
import { buildAdjacencyList, buildReverseAdjacencyList } from '../parser';

/**
 * 将 ExecutionPlan + DAG 编译为 Temporal Workflow 代码
 */
export function compileWorkflow(
  dag: WorkflowDAG,
  plan: ExecutionPlan,
): CompiledWorkflow {
  const workflowName = `ClawTeamsWorkflow_${sanitize(dag.goal_id)}`;
  const taskQueue = `clawteams-${sanitize(dag.goal_id)}`;

  const signalDefs = extractSignalDefinitions(dag);
  const workflowCode = generateWorkflowCode(dag, plan, workflowName, signalDefs);
  const activitiesCode = generateActivitiesCode(dag, plan);
  const workerCode = generateWorkerCode(workflowName, taskQueue);

  return {
    workflow_name: workflowName,
    workflow_id: plan.workflow_id,
    task_queue: taskQueue,
    workflow_code: workflowCode,
    activities_code: activitiesCode,
    worker_code: workerCode,
    signal_definitions: signalDefs,
    compiled_at: new Date().toISOString(),
  };
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 32);
}

/**
 * 提取所有 Human 节点的信号定义
 */
function extractSignalDefinitions(dag: WorkflowDAG): SignalDefinition[] {
  return dag.nodes
    .filter((n) => n.type === 'Human')
    .map((n) => ({
      name: `human_approval_${sanitize(n.id)}`,
      node_id: n.id,
      description: n.human_description ?? n.label,
    }));
}

/**
 * 生成 Temporal Workflow 代码
 */
function generateWorkflowCode(
  dag: WorkflowDAG,
  plan: ExecutionPlan,
  workflowName: string,
  signals: SignalDefinition[],
): string {
  const adjacency = buildAdjacencyList(dag.nodes, dag.edges);
  const reverseAdj = buildReverseAdjacencyList(dag.nodes, dag.edges);
  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));
  const assignmentMap = new Map<string, { agent_id: string; agent_name: string }>();

  for (const stage of plan.stages) {
    for (const a of stage.assignments) {
      assignmentMap.set(a.node_id, {
        agent_id: a.assigned_agent_id,
        agent_name: a.assigned_agent_name,
      });
    }
  }

  const lines: string[] = [];

  // Imports
  lines.push(`import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow';`);
  lines.push(`import type { TaskActivities } from './activities';`);
  lines.push('');

  // Activity proxy
  lines.push(`const activities = proxyActivities<TaskActivities>({`);
  lines.push(`  startToCloseTimeout: '30m',`);
  lines.push(`  retry: { maximumAttempts: 3 },`);
  lines.push(`});`);
  lines.push('');

  // Signal definitions for Human nodes
  for (const sig of signals) {
    lines.push(`export const ${sig.name}Signal = defineSignal<[{ approved: boolean; resolution?: string }]>('${sig.name}');`);
  }
  if (signals.length > 0) lines.push('');

  // Workflow input type
  lines.push(`export interface WorkflowInput {`);
  lines.push(`  goal_id: string;`);
  lines.push(`  workflow_id: string;`);
  lines.push(`  parameters: Record<string, unknown>;`);
  lines.push(`}`);
  lines.push('');

  // Workflow function
  lines.push(`export async function ${workflowName}(input: WorkflowInput): Promise<Record<string, unknown>> {`);
  lines.push(`  const results: Record<string, unknown> = {};`);

  // Signal state variables for Human nodes
  for (const sig of signals) {
    lines.push(`  let ${sig.name}_resolved = false;`);
    lines.push(`  let ${sig.name}_approval: { approved: boolean; resolution?: string } | null = null;`);
    lines.push('');
    lines.push(`  setHandler(${sig.name}Signal, (data) => {`);
    lines.push(`    ${sig.name}_resolved = true;`);
    lines.push(`    ${sig.name}_approval = data;`);
    lines.push(`  });`);
    lines.push('');
  }

  // Generate code per stage
  for (const stage of plan.stages) {
    lines.push('');
    lines.push(`  // ─── Stage ${stage.stage_index} ───`);

    const stageNodes = stage.assignments
      .map((a) => nodeMap.get(a.node_id))
      .filter((n): n is WorkflowNode => !!n);

    if (stage.parallel && stageNodes.length > 1) {
      // Parallel execution with Promise.all
      lines.push(`  const stage${stage.stage_index}Results = await Promise.all([`);
      for (const node of stageNodes) {
        lines.push(`    ${generateNodeCall(node, dag, assignmentMap, signals)},`);
      }
      lines.push(`  ]);`);
      stageNodes.forEach((node, i) => {
        lines.push(`  results['${node.id}'] = stage${stage.stage_index}Results[${i}];`);
      });
    } else {
      // Sequential execution
      for (const node of stageNodes) {
        // Check for LOOP_BACK edges pointing TO this node
        const loopBackEdges = dag.edges.filter(
          (e) => e.edge_type === 'LOOP_BACK' && e.to_id === node.id,
        );

        if (loopBackEdges.length > 0) {
          // Generate loop structure
          const loopSource = loopBackEdges[0].from_id;
          const loopCondition = loopBackEdges[0].condition_expr ?? `results['${loopSource}']?.needs_retry`;
          lines.push(`  let loop_${sanitize(node.id)} = true;`);
          lines.push(`  while (loop_${sanitize(node.id)}) {`);
          lines.push(`    results['${node.id}'] = await ${generateNodeCall(node, dag, assignmentMap, signals)};`);
          lines.push(`    // Loop back condition checked after downstream node`);
          lines.push(`    loop_${sanitize(node.id)} = Boolean(${loopCondition});`);
          lines.push(`  }`);
        } else {
          // Check for CONDITION edges FROM this node
          const conditionEdges = (adjacency.get(node.id) ?? []).filter(
            (e) => e.edge_type === 'CONDITION',
          );

          if (node.type === 'Decision' && conditionEdges.length > 0) {
            lines.push(`  results['${node.id}'] = await ${generateNodeCall(node, dag, assignmentMap, signals)};`);
            lines.push(`  const decision_${sanitize(node.id)} = results['${node.id}'] as { chosen_option: string };`);
            let first = true;
            for (const ce of conditionEdges) {
              const targetNode = nodeMap.get(ce.to_id);
              const condExpr = ce.condition_expr ?? `'${ce.to_id}'`;
              const keyword = first ? 'if' : 'else if';
              lines.push(`  ${keyword} (decision_${sanitize(node.id)}.chosen_option === ${condExpr}) {`);
              if (targetNode) {
                lines.push(`    results['${ce.to_id}'] = await ${generateNodeCall(targetNode, dag, assignmentMap, signals)};`);
              }
              lines.push(`  }`);
              first = false;
            }
          } else {
            lines.push(`  results['${node.id}'] = await ${generateNodeCall(node, dag, assignmentMap, signals)};`);
          }
        }
      }
    }
  }

  lines.push('');
  lines.push(`  return results;`);
  lines.push(`}`);

  return lines.join('\n');
}

/**
 * 生成单个节点的调用代码
 */
function generateNodeCall(
  node: WorkflowNode,
  dag: WorkflowDAG,
  assignmentMap: Map<string, { agent_id: string; agent_name: string }>,
  signals: SignalDefinition[],
): string {
  const assignment = assignmentMap.get(node.id);

  if (node.type === 'Human') {
    const sigName = `human_approval_${sanitize(node.id)}`;
    return `(async () => {
      await condition(() => ${sigName}_resolved);
      return ${sigName}_approval;
    })()`;
  }

  if (node.type === 'Goal') {
    return `Promise.resolve({ node_id: '${node.id}', type: 'goal', label: '${escapeStr(node.label)}' })`;
  }

  const agentId = assignment?.agent_id ?? '';
  return `activities.executeTask({
      node_id: '${node.id}',
      task_type: '${node.task_type ?? 'generic'}',
      label: '${escapeStr(node.label)}',
      agent_id: '${agentId}',
      parameters: input.parameters['${node.id}'] ?? {},
    })`;
}

function escapeStr(s: string): string {
  return s.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/**
 * 生成 Activities 代码
 */
function generateActivitiesCode(dag: WorkflowDAG, plan: ExecutionPlan): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Auto-generated Temporal Activities for workflow: ${dag.goal_id}`);
  lines.push(` */`);
  lines.push('');
  lines.push(`export interface TaskExecutionInput {`);
  lines.push(`  node_id: string;`);
  lines.push(`  task_type: string;`);
  lines.push(`  label: string;`);
  lines.push(`  agent_id: string;`);
  lines.push(`  parameters: Record<string, unknown>;`);
  lines.push(`}`);
  lines.push('');
  lines.push(`export interface TaskExecutionResult {`);
  lines.push(`  node_id: string;`);
  lines.push(`  success: boolean;`);
  lines.push(`  output: Record<string, unknown>;`);
  lines.push(`  artifact_ids: string[];`);
  lines.push(`  needs_retry?: boolean;`);
  lines.push(`}`);
  lines.push('');
  lines.push(`export interface TaskActivities {`);
  lines.push(`  executeTask(input: TaskExecutionInput): Promise<TaskExecutionResult>;`);
  lines.push(`}`);
  lines.push('');
  lines.push(`/**`);
  lines.push(` * Activity 实现：通过事件总线将任务分派给对应龙虾执行`);
  lines.push(` * 实际实现需要注入 EventBus 和任务管理依赖`);
  lines.push(` */`);
  lines.push(`export function createActivities(deps: {`);
  lines.push(`  dispatchTask: (input: TaskExecutionInput) => Promise<TaskExecutionResult>;`);
  lines.push(`}): TaskActivities {`);
  lines.push(`  return {`);
  lines.push(`    async executeTask(input: TaskExecutionInput): Promise<TaskExecutionResult> {`);
  lines.push(`      return deps.dispatchTask(input);`);
  lines.push(`    },`);
  lines.push(`  };`);
  lines.push(`}`);

  return lines.join('\n');
}

/**
 * 生成 Worker 注册代码
 */
function generateWorkerCode(workflowName: string, taskQueue: string): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Auto-generated Temporal Worker for ${workflowName}`);
  lines.push(` */`);
  lines.push(`import { Worker } from '@temporalio/worker';`);
  lines.push(`import { createActivities } from './activities';`);
  lines.push('');
  lines.push(`export async function startWorker(deps: {`);
  lines.push(`  temporalAddress: string;`);
  lines.push(`  namespace: string;`);
  lines.push(`  dispatchTask: (input: any) => Promise<any>;`);
  lines.push(`}): Promise<Worker> {`);
  lines.push(`  const activities = createActivities({ dispatchTask: deps.dispatchTask });`);
  lines.push('');
  lines.push(`  const worker = await Worker.create({`);
  lines.push(`    workflowsPath: require.resolve('./workflow'),`);
  lines.push(`    activities,`);
  lines.push(`    taskQueue: '${taskQueue}',`);
  lines.push(`    connection: {`);
  lines.push(`      address: deps.temporalAddress,`);
  lines.push(`    } as any,`);
  lines.push(`    namespace: deps.namespace,`);
  lines.push(`  });`);
  lines.push('');
  lines.push(`  await worker.run();`);
  lines.push(`  return worker;`);
  lines.push(`}`);

  return lines.join('\n');
}
