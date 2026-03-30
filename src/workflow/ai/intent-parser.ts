/**
 * AI 驱动链路 — 自然语言 → 结构化意图 JSON
 *
 * 使用接口抽象，不绑定具体 LLM。
 * 包含 Schema 验证 + 一致性检查。
 */

import type {
  IntentSubGraph,
} from '../../infra/shared';

import type {
  NaturalLanguageIntent,
  StructuredIntent,
  AIProvider,
  WorkflowDAG,
  ExecutionPlan,
} from '../types';
import type { AgentIdentity } from '../../infra/shared';

// ─── 验证错误 ───
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// ─── 有效的节点类型 ───
const VALID_NODE_TYPES: Set<string> = new Set([
  'Goal', 'Task', 'Decision', 'Human', 'Cognition',
  'Agent', 'User', 'Team', 'Role',
]);

const VALID_EDGE_TYPES: Set<string> = new Set([
  'DEPENDS_ON', 'PARALLEL_WITH', 'CONDITION', 'AGGREGATES',
  'LOOP_BACK', 'BELONGS_TO', 'OWNS', 'RESPONSIBLE_FOR',
  'RELATES_TO', 'EVOLVED_FROM',
]);

/**
 * 验证 IntentSubGraph 的 Schema 正确性
 */
export function validateIntentGraph(graph: IntentSubGraph): ValidationError[] {
  const errors: ValidationError[] = [];

  // 基本字段检查
  if (!graph.goal_id || typeof graph.goal_id !== 'string') {
    errors.push({ field: 'goal_id', message: 'goal_id 必须是非空字符串', severity: 'error' });
  }
  if (typeof graph.version !== 'number' || graph.version < 1) {
    errors.push({ field: 'version', message: 'version 必须是正整数', severity: 'error' });
  }
  if (!Array.isArray(graph.nodes)) {
    errors.push({ field: 'nodes', message: 'nodes 必须是数组', severity: 'error' });
    return errors;
  }
  if (!Array.isArray(graph.edges)) {
    errors.push({ field: 'edges', message: 'edges 必须是数组', severity: 'error' });
    return errors;
  }

  // 节点验证
  const nodeIds = new Set<string>();
  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if (!node.id) {
      errors.push({ field: `nodes[${i}].id`, message: '节点 ID 不能为空', severity: 'error' });
    }
    if (nodeIds.has(node.id)) {
      errors.push({ field: `nodes[${i}].id`, message: `节点 ID 重复: ${node.id}`, severity: 'error' });
    }
    nodeIds.add(node.id);

    if (!VALID_NODE_TYPES.has(node.type)) {
      errors.push({
        field: `nodes[${i}].type`,
        message: `无效的节点类型: ${node.type}`,
        severity: 'error',
      });
    }
  }

  // 边验证
  const edgeIds = new Set<string>();
  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    if (!edge.id) {
      errors.push({ field: `edges[${i}].id`, message: '边 ID 不能为空', severity: 'error' });
    }
    if (edgeIds.has(edge.id)) {
      errors.push({ field: `edges[${i}].id`, message: `边 ID 重复: ${edge.id}`, severity: 'error' });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.from_id)) {
      errors.push({
        field: `edges[${i}].from_id`,
        message: `边的起始节点不存在: ${edge.from_id}`,
        severity: 'error',
      });
    }
    if (!nodeIds.has(edge.to_id)) {
      errors.push({
        field: `edges[${i}].to_id`,
        message: `边的目标节点不存在: ${edge.to_id}`,
        severity: 'error',
      });
    }
    if (!VALID_EDGE_TYPES.has(edge.edge_type)) {
      errors.push({
        field: `edges[${i}].edge_type`,
        message: `无效的边类型: ${edge.edge_type}`,
        severity: 'error',
      });
    }
    if (edge.edge_type === 'CONDITION' && !edge.condition_expr) {
      errors.push({
        field: `edges[${i}].condition_expr`,
        message: 'CONDITION 边应包含条件表达式',
        severity: 'warning',
      });
    }
  }

  return errors;
}

/**
 * 一致性检查
 */
export function checkConsistency(graph: IntentSubGraph): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // 检查是否至少有一个 Goal 节点
  const goalNodes = graph.nodes.filter((n) => n.type === 'Goal');
  if (goalNodes.length === 0) {
    errors.push({
      field: 'nodes',
      message: '图谱中至少需要一个 Goal 节点',
      severity: 'error',
    });
  }

  // 检查 Task 节点是否都可达（从 Goal 出发能到达）
  const goalIds = goalNodes.map((n) => n.id);
  const reachable = new Set<string>();
  const adjForward = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjForward.has(edge.from_id)) adjForward.set(edge.from_id, []);
    adjForward.get(edge.from_id)!.push(edge.to_id);
  }

  const queue = [...goalIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of adjForward.get(current) ?? []) {
      if (!reachable.has(next)) queue.push(next);
    }
  }

  for (const node of graph.nodes) {
    if (node.type === 'Task' && !reachable.has(node.id)) {
      errors.push({
        field: `node.${node.id}`,
        message: `Task 节点 "${node.id}" 从 Goal 节点不可达`,
        severity: 'warning',
      });
    }
  }

  // 检查 LOOP_BACK 边的合理性（目标节点应在源节点的上游）
  for (const edge of graph.edges) {
    if (edge.edge_type === 'LOOP_BACK') {
      // LOOP_BACK 的 from_id 应该在拓扑序中晚于 to_id
      // 简单检查：to_id 不应等于 from_id
      if (edge.from_id === edge.to_id) {
        errors.push({
          field: `edge.${edge.id}`,
          message: `LOOP_BACK 边不应自环: ${edge.from_id} → ${edge.to_id}`,
          severity: 'error',
        });
      }
    }
  }

  return errors;
}

/**
 * AI 意图解析器（使用注入的 AIProvider）
 */
export class IntentParser {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * 解析自然语言为结构化意图，并进行验证
   */
  async parse(input: NaturalLanguageIntent): Promise<{
    intent: StructuredIntent;
    validationErrors: ValidationError[];
    consistencyErrors: ValidationError[];
  }> {
    const intent = await this.provider.parseIntent(input);

    const validationErrors = validateIntentGraph(intent.graph);
    const consistencyErrors = checkConsistency(intent.graph);

    // 如果有严重错误，标记需要确认
    const hasErrors = [...validationErrors, ...consistencyErrors].some(
      (e) => e.severity === 'error',
    );
    if (hasErrors) {
      intent.needs_confirmation = true;
    }

    return { intent, validationErrors, consistencyErrors };
  }

  /**
   * AI 辅助生成执行计划
   */
  async suggestPlan(
    dag: WorkflowDAG,
    agents: AgentIdentity[],
  ): Promise<ExecutionPlan> {
    return this.provider.suggestPlan(dag, agents);
  }
}
