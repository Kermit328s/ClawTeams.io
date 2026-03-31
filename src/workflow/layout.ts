// ============================================================
// 工作流图布局算法 — 分层布局，节点位置计算
// ============================================================

import { WorkflowNode, WorkflowEdge } from './types';

const HORIZONTAL_GAP = 250;
const VERTICAL_GAP = 150;
const CROSSCUT_OFFSET_Y = 300;
const ORCHESTRATOR_OFFSET_Y = -150;

/**
 * 图布局算法
 *
 * 布局规则:
 * - 拓扑排序确定水平顺序
 * - 主链节点水平排列（x 递增）
 * - 并行节点垂直排列（相同 x，不同 y）
 * - 横切节点（is_crosscut=true）放在主链下方
 * - 编排节点（orchestrator）放在顶部
 */
export class GraphLayout {
  /**
   * 计算节点位置并返回更新后的节点列表
   */
  static layout(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    if (nodes.length === 0) return nodes;

    // 分类节点
    const orchestratorNodes: WorkflowNode[] = [];
    const crosscutNodes: WorkflowNode[] = [];
    const mainNodes: WorkflowNode[] = [];

    for (const node of nodes) {
      if (node.data.is_crosscut) {
        crosscutNodes.push(node);
      } else if (this.isOrchestrator(node)) {
        orchestratorNodes.push(node);
      } else {
        mainNodes.push(node);
      }
    }

    // 对主链节点做拓扑排序
    const sortedMain = this.topologicalSort(mainNodes, edges);

    // 布局主链节点（水平排列）
    const mainBaseY = 100;
    for (let i = 0; i < sortedMain.length; i++) {
      sortedMain[i].position = {
        x: 100 + i * HORIZONTAL_GAP,
        y: mainBaseY,
      };
    }

    // 检测并行节点（没有直接前后关系的节点应该垂直排列）
    this.adjustParallelNodes(sortedMain, edges);

    // 布局编排节点（顶部居中）
    const mainCenterX = sortedMain.length > 0
      ? sortedMain[Math.floor(sortedMain.length / 2)].position.x
      : 100;

    for (let i = 0; i < orchestratorNodes.length; i++) {
      orchestratorNodes[i].position = {
        x: mainCenterX + i * HORIZONTAL_GAP,
        y: mainBaseY + ORCHESTRATOR_OFFSET_Y,
      };
    }

    // 布局横切节点（主链下方居中）
    for (let i = 0; i < crosscutNodes.length; i++) {
      crosscutNodes[i].position = {
        x: mainCenterX + i * HORIZONTAL_GAP,
        y: mainBaseY + CROSSCUT_OFFSET_Y,
      };
    }

    return [...orchestratorNodes, ...sortedMain, ...crosscutNodes];
  }

  /**
   * 拓扑排序（Kahn 算法）
   * 按有向边确定节点顺序
   */
  private static topologicalSort(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ): WorkflowNode[] {
    if (nodes.length <= 1) return [...nodes];

    const nodeIds = new Set(nodes.map(n => n.id));

    // 构建邻接表和入度表
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    // 只考虑 sequence 和 collaboration/data_flow 类型的有向边
    for (const edge of edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target) {
        adjList.get(edge.source)!.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      }
    }

    // Kahn 算法
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of adjList.get(current) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 如果存在环，将剩余节点追加
    for (const id of nodeIds) {
      if (!sorted.includes(id)) {
        sorted.push(id);
      }
    }

    // 按排序结果返回节点
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    return sorted.map(id => nodeMap.get(id)!).filter(Boolean);
  }

  /**
   * 调整并行节点位置
   * 如果两个节点在同一层级（没有直接顺序关系），垂直排列
   */
  private static adjustParallelNodes(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ): void {
    // 找出同一 x 位置的节点，检查是否应该分开
    const byX = new Map<number, WorkflowNode[]>();
    for (const node of nodes) {
      const x = node.position.x;
      const list = byX.get(x) ?? [];
      list.push(node);
      byX.set(x, list);
    }

    for (const [, group] of byX) {
      if (group.length > 1) {
        // 多个节点在同一列，垂直分开
        const baseY = group[0].position.y;
        for (let i = 0; i < group.length; i++) {
          group[i].position.y = baseY + i * VERTICAL_GAP;
        }
      }
    }
  }

  /**
   * 判断是否为编排节点
   */
  private static isOrchestrator(node: WorkflowNode): boolean {
    const id = node.id.toLowerCase();
    const name = node.data.name.toLowerCase();
    return (
      // 不含 trigger/variable/industry/asset/redteam 等子代理后缀
      (id.endsWith('-invest') || id === 'butterfly-invest') &&
      !id.includes('-trigger') &&
      !id.includes('-variable') &&
      !id.includes('-industry') &&
      !id.includes('-asset') &&
      !id.includes('-redteam')
    ) || /orchestrat|总控|编排/.test(name);
  }
}
