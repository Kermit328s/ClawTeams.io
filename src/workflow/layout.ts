// ============================================================
// 工作流图布局算法 — 技能级小卡片链条布局
// ============================================================
//
// 布局策略：
//   - 同一 Agent 的技能卡片水平排列成一行
//   - 不同 Agent 的行垂直排列
//   - 主链顺序：Trigger → Variable → Industry → Asset
//   - Redteam 在最底部
//   - Agent 行的左侧预留 Agent 标签空间
//

import { WorkflowNode, WorkflowEdge, AgentGroupNode } from './types';

// 技能卡片尺寸
const CARD_WIDTH = 200;
const CARD_HEIGHT = 170;
const CARD_GAP_X = 40;           // 同一 Agent 内卡片间距
const ROW_GAP_Y = 80;            // Agent 行之间间距
const AGENT_LABEL_WIDTH = 60;    // Agent 标签左侧预留宽度
const ROW_PADDING_X = 20;        // 行内左右 padding
const ROW_PADDING_Y = 20;        // 行内上下 padding
const START_X = 40;
const START_Y = 40;

/** 主链排列顺序 */
const MAIN_CHAIN_ORDER = ['trigger', 'variable', 'industry', 'asset'];

export class GraphLayout {
  /**
   * 计算技能级节点布局
   * 返回带有位置的节点列表 + Agent 分组节点
   */
  static layout(
    nodes: WorkflowNode[],
    _edges: WorkflowEdge[],
  ): { skillNodes: WorkflowNode[]; groupNodes: AgentGroupNode[] } {
    if (nodes.length === 0) return { skillNodes: [], groupNodes: [] };

    // 按 agent_id 分组
    const agentGroups = new Map<string, WorkflowNode[]>();
    for (const node of nodes) {
      const agentId = node.data.agent_id;
      const list = agentGroups.get(agentId) ?? [];
      list.push(node);
      agentGroups.set(agentId, list);
    }

    // 确定行顺序：主链 → 其他非横切 → 横切（Redteam）
    const orderedAgentIds: string[] = [];
    const crosscutAgentIds: string[] = [];
    const otherAgentIds: string[] = [];

    // 先收集所有 agent_id
    for (const agentId of agentGroups.keys()) {
      const isCrosscut = agentGroups.get(agentId)![0]?.data.is_crosscut;
      const mainIndex = MAIN_CHAIN_ORDER.findIndex(k => agentId.toLowerCase().includes(k));

      if (isCrosscut) {
        crosscutAgentIds.push(agentId);
      } else if (mainIndex >= 0) {
        // 将在排序时处理
      } else {
        otherAgentIds.push(agentId);
      }
    }

    // 按主链顺序添加
    for (const key of MAIN_CHAIN_ORDER) {
      for (const agentId of agentGroups.keys()) {
        if (agentId.toLowerCase().includes(key) && !crosscutAgentIds.includes(agentId)) {
          if (!orderedAgentIds.includes(agentId)) {
            orderedAgentIds.push(agentId);
          }
        }
      }
    }

    // 添加其他非横切
    for (const agentId of otherAgentIds) {
      if (!orderedAgentIds.includes(agentId)) {
        orderedAgentIds.push(agentId);
      }
    }

    // 最后添加横切
    orderedAgentIds.push(...crosscutAgentIds);

    // 计算每行的位置
    const skillNodes: WorkflowNode[] = [];
    const groupNodes: AgentGroupNode[] = [];
    let currentY = START_Y;

    for (const agentId of orderedAgentIds) {
      const agentSkills = agentGroups.get(agentId);
      if (!agentSkills || agentSkills.length === 0) continue;

      // 按 skill_index 排序
      agentSkills.sort((a, b) => a.data.skill_index - b.data.skill_index);

      const firstSkill = agentSkills[0];
      const skillCount = agentSkills.length;
      const rowWidth = AGENT_LABEL_WIDTH + ROW_PADDING_X * 2 + skillCount * CARD_WIDTH + (skillCount - 1) * CARD_GAP_X;
      const rowHeight = ROW_PADDING_Y * 2 + CARD_HEIGHT;

      // 创建 Agent 分组节点（背景）
      const groupNode: AgentGroupNode = {
        id: `group-${agentId}`,
        type: 'agent-group',
        position: { x: START_X, y: currentY },
        data: {
          agent_id: agentId,
          agent_name: firstSkill.data.agent_name,
          agent_emoji: firstSkill.data.agent_emoji,
          agent_color: firstSkill.data.agent_color,
          is_crosscut: firstSkill.data.is_crosscut,
          skill_count: skillCount,
        },
        style: { width: rowWidth, height: rowHeight },
      };
      groupNodes.push(groupNode);

      // 布局该行的技能卡片
      for (let i = 0; i < agentSkills.length; i++) {
        const skill = agentSkills[i];
        skill.position = {
          x: START_X + AGENT_LABEL_WIDTH + ROW_PADDING_X + i * (CARD_WIDTH + CARD_GAP_X),
          y: currentY + ROW_PADDING_Y,
        };
        skillNodes.push(skill);
      }

      currentY += rowHeight + ROW_GAP_Y;
    }

    return { skillNodes, groupNodes };
  }
}
