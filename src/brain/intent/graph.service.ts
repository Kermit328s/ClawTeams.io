/**
 * 意图图谱服务
 * Intent Graph CRUD — 四层节点（愿景/战略/阶段计划/具体事项）
 * 节点和边的增删改查
 */

import type { Session as Neo4jSession } from 'neo4j-driver';
import type {
  GoalNode,
  GoalStatus,
  Priority,
  GraphEdge,
  IntentEdgeType,
  IntentSubGraph,
  BaseNode,
} from '../../infra/shared';

// ─── 意图层级枚举 ───
export type IntentLayer = 'vision' | 'strategy' | 'phase_plan' | 'action_item';

// ─── 创建目标请求 ───
export interface CreateGoalRequest {
  title: string;
  description?: string;
  team_id: string;
  priority?: Priority;
  deadline?: string;
  layer: IntentLayer;
  parent_id?: string; // 上级目标 ID
}

export interface UpdateGoalRequest {
  title?: string;
  description?: string;
  status?: GoalStatus;
  priority?: Priority;
  deadline?: string;
}

export interface CreateEdgeRequest {
  from_id: string;
  to_id: string;
  edge_type: IntentEdgeType;
  condition_expr?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

// ─── 意图图谱服务 ───
export class IntentGraphService {
  constructor(private readonly neo4j: Neo4jSession) {}

  /** 创建目标节点 */
  async createGoal(req: CreateGoalRequest): Promise<GoalNode> {
    const result = await this.neo4j.run(
      `CREATE (g:Goal {
        id: randomUUID(),
        title: $title,
        description: $description,
        status: 'active',
        priority: $priority,
        team_id: $team_id,
        layer: $layer,
        deadline: $deadline,
        created_at: datetime(),
        updated_at: datetime()
      })
      RETURN g`,
      {
        title: req.title,
        description: req.description ?? '',
        priority: req.priority ?? 'medium',
        team_id: req.team_id,
        layer: req.layer,
        deadline: req.deadline ?? null,
      },
    );

    const node = result.records[0].get('g').properties;
    const goalNode = this.mapGoalNode(node);

    // 如果有父级，建立 BELONGS_TO 关系
    if (req.parent_id) {
      await this.neo4j.run(
        `MATCH (child:Goal {id: $child_id}), (parent:Goal {id: $parent_id})
         MERGE (child)-[:BELONGS_TO]->(parent)`,
        { child_id: goalNode.id, parent_id: req.parent_id },
      );
    }

    return goalNode;
  }

  /** 获取目标详情（含子图） */
  async getGoalDetail(goalId: string): Promise<{ goal: GoalNode; subgraph: IntentSubGraph } | null> {
    const goalResult = await this.neo4j.run(
      `MATCH (g:Goal {id: $id}) RETURN g`,
      { id: goalId },
    );
    if (goalResult.records.length === 0) return null;

    const goal = this.mapGoalNode(goalResult.records[0].get('g').properties);

    // 获取子图：该目标下的所有节点和边
    const subResult = await this.neo4j.run(
      `MATCH (g:Goal {id: $id})
       OPTIONAL MATCH (child)-[:BELONGS_TO*]->(g)
       WITH collect(child) + [g] AS nodes
       UNWIND nodes AS n
       WITH collect(DISTINCT n) AS allNodes
       UNWIND allNodes AS a
       UNWIND allNodes AS b
       OPTIONAL MATCH (a)-[r]->(b)
       WHERE type(r) IN ['DEPENDS_ON','PARALLEL_WITH','CONDITION','AGGREGATES','LOOP_BACK','BELONGS_TO']
       RETURN collect(DISTINCT {
         id: a.id, type: labels(a)[0], title: a.title, status: a.status,
         state: a.state, priority: a.priority, team_id: a.team_id,
         created_at: toString(a.created_at), updated_at: toString(a.updated_at)
       }) AS nodes,
       collect(DISTINCT {
         from_id: a.id, to_id: b.id, edge_type: type(r),
         weight: r.weight, condition_expr: r.condition_expr,
         created_at: toString(r.created_at)
       }) AS edges`,
      { id: goalId },
    );

    const nodesRaw = subResult.records[0]?.get('nodes') ?? [];
    const edgesRaw = subResult.records[0]?.get('edges') ?? [];

    const nodes: BaseNode[] = nodesRaw
      .filter((n: Record<string, unknown>) => n.id != null)
      .map((n: Record<string, unknown>) => ({
        id: n.id as string,
        type: n.type as string,
        created_at: n.created_at as string ?? '',
        updated_at: n.updated_at as string ?? '',
      }));

    const edges: GraphEdge[] = edgesRaw
      .filter((e: Record<string, unknown>) => e.from_id != null && e.to_id != null && e.edge_type != null)
      .map((e: Record<string, unknown>) => ({
        id: `${e.from_id}-${e.edge_type}-${e.to_id}`,
        from_id: e.from_id as string,
        to_id: e.to_id as string,
        edge_type: e.edge_type as IntentEdgeType,
        weight: e.weight as number | undefined,
        condition_expr: e.condition_expr as string | undefined,
        created_at: e.created_at as string ?? '',
      }));

    return {
      goal,
      subgraph: { goal_id: goalId, nodes, edges, version: 1 },
    };
  }

  /** 获取团队的目标列表 */
  async listGoals(teamId: string, status?: GoalStatus, layer?: IntentLayer): Promise<GoalNode[]> {
    const conditions = ['g.team_id = $team_id'];
    const params: Record<string, unknown> = { team_id: teamId };

    if (status) {
      conditions.push('g.status = $status');
      params.status = status;
    }
    if (layer) {
      conditions.push('g.layer = $layer');
      params.layer = layer;
    }

    const result = await this.neo4j.run(
      `MATCH (g:Goal) WHERE ${conditions.join(' AND ')} RETURN g ORDER BY g.created_at DESC`,
      params,
    );

    return result.records.map((r) => this.mapGoalNode(r.get('g').properties));
  }

  /** 更新目标 */
  async updateGoal(goalId: string, req: UpdateGoalRequest): Promise<GoalNode | null> {
    const setClauses: string[] = ['g.updated_at = datetime()'];
    const params: Record<string, unknown> = { id: goalId };

    if (req.title !== undefined) { setClauses.push('g.title = $title'); params.title = req.title; }
    if (req.description !== undefined) { setClauses.push('g.description = $description'); params.description = req.description; }
    if (req.status !== undefined) { setClauses.push('g.status = $status'); params.status = req.status; }
    if (req.priority !== undefined) { setClauses.push('g.priority = $priority'); params.priority = req.priority; }
    if (req.deadline !== undefined) { setClauses.push('g.deadline = $deadline'); params.deadline = req.deadline; }

    const result = await this.neo4j.run(
      `MATCH (g:Goal {id: $id}) SET ${setClauses.join(', ')} RETURN g`,
      params,
    );

    return result.records.length > 0 ? this.mapGoalNode(result.records[0].get('g').properties) : null;
  }

  /** 删除目标（级联删除子节点） */
  async deleteGoal(goalId: string): Promise<boolean> {
    const result = await this.neo4j.run(
      `MATCH (g:Goal {id: $id})
       OPTIONAL MATCH (child)-[:BELONGS_TO*]->(g)
       DETACH DELETE child, g
       RETURN count(g) AS deleted`,
      { id: goalId },
    );
    const deleted = result.records[0]?.get('deleted');
    return deleted != null && (typeof deleted === 'object' ? deleted.toNumber() : deleted) > 0;
  }

  /** 创建边 */
  async createEdge(req: CreateEdgeRequest): Promise<GraphEdge> {
    const result = await this.neo4j.run(
      `MATCH (a {id: $from_id}), (b {id: $to_id})
       CREATE (a)-[r:${req.edge_type} {
         weight: $weight,
         condition_expr: $condition_expr,
         created_at: datetime()
       }]->(b)
       RETURN a.id AS from_id, b.id AS to_id, type(r) AS edge_type,
              r.weight AS weight, r.condition_expr AS condition_expr,
              toString(r.created_at) AS created_at`,
      {
        from_id: req.from_id,
        to_id: req.to_id,
        weight: req.weight ?? null,
        condition_expr: req.condition_expr ?? null,
      },
    );

    const record = result.records[0];
    return {
      id: `${req.from_id}-${req.edge_type}-${req.to_id}`,
      from_id: record.get('from_id'),
      to_id: record.get('to_id'),
      edge_type: record.get('edge_type') as IntentEdgeType,
      weight: record.get('weight') ?? undefined,
      condition_expr: record.get('condition_expr') ?? undefined,
      created_at: record.get('created_at'),
    };
  }

  /** 删除边 */
  async deleteEdge(fromId: string, toId: string, edgeType: IntentEdgeType): Promise<boolean> {
    const result = await this.neo4j.run(
      `MATCH (a {id: $from_id})-[r:${edgeType}]->(b {id: $to_id})
       DELETE r
       RETURN count(r) AS deleted`,
      { from_id: fromId, to_id: toId },
    );
    const deleted = result.records[0]?.get('deleted');
    return deleted != null && (typeof deleted === 'object' ? deleted.toNumber() : deleted) > 0;
  }

  /** 获取节点的所有边 */
  async getEdges(nodeId: string): Promise<GraphEdge[]> {
    const result = await this.neo4j.run(
      `MATCH (a {id: $id})-[r]->(b)
       WHERE type(r) IN ['DEPENDS_ON','PARALLEL_WITH','CONDITION','AGGREGATES','LOOP_BACK','BELONGS_TO','RESPONSIBLE_FOR','RELATES_TO','EVOLVED_FROM']
       RETURN a.id AS from_id, b.id AS to_id, type(r) AS edge_type,
              r.weight AS weight, r.condition_expr AS condition_expr,
              toString(r.created_at) AS created_at
       UNION
       MATCH (b)-[r]->(a {id: $id})
       WHERE type(r) IN ['DEPENDS_ON','PARALLEL_WITH','CONDITION','AGGREGATES','LOOP_BACK','BELONGS_TO','RESPONSIBLE_FOR','RELATES_TO','EVOLVED_FROM']
       RETURN b.id AS from_id, a.id AS to_id, type(r) AS edge_type,
              r.weight AS weight, r.condition_expr AS condition_expr,
              toString(r.created_at) AS created_at`,
      { id: nodeId },
    );

    return result.records.map((record) => ({
      id: `${record.get('from_id')}-${record.get('edge_type')}-${record.get('to_id')}`,
      from_id: record.get('from_id'),
      to_id: record.get('to_id'),
      edge_type: record.get('edge_type') as IntentEdgeType,
      weight: record.get('weight') ?? undefined,
      condition_expr: record.get('condition_expr') ?? undefined,
      created_at: record.get('created_at') ?? '',
    }));
  }

  private mapGoalNode(props: Record<string, unknown>): GoalNode {
    return {
      id: props.id as string,
      type: 'Goal',
      title: props.title as string,
      description: props.description as string | undefined,
      status: (props.status as GoalStatus) ?? 'active',
      priority: (props.priority as Priority) ?? 'medium',
      team_id: props.team_id as string,
      deadline: props.deadline as string | undefined,
      created_at: props.created_at ? String(props.created_at) : '',
      updated_at: props.updated_at ? String(props.updated_at) : '',
    };
  }
}
