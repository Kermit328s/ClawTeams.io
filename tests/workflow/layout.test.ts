// ============================================================
// GraphLayout 测试 — 技能级版本
// ============================================================

import { GraphLayout } from '../../src/workflow/layout';
import { WorkflowNode, WorkflowEdge } from '../../src/workflow/types';

function makeSkillNode(agentId: string, skillIndex: number, overrides?: Partial<WorkflowNode['data']>): WorkflowNode {
  return {
    id: `${agentId}::${skillIndex}`,
    type: 'skill',
    position: { x: 0, y: 0 },
    data: {
      skill_id: `${agentId}::${skillIndex}`,
      agent_id: agentId,
      agent_emoji: '🤖',
      agent_name: agentId,
      skill_name: `Skill ${skillIndex}`,
      skill_icon: '⚡',
      skill_index: skillIndex,
      skill_total: 3,
      status: 'idle',
      is_crosscut: false,
      agent_color: '#64748B',
      execution_stats: { total: 0, succeeded: 0, failed: 0, tokens: 0 },
      ...overrides,
    },
  };
}

function makeEdge(source: string, target: string, type: WorkflowEdge['type'] = 'internal'): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type,
    data: { label: '', strength: 1, source_info: 'test' },
  };
}

describe('GraphLayout', () => {
  it('handles empty nodes', () => {
    const result = GraphLayout.layout([], []);
    expect(result.skillNodes).toEqual([]);
    expect(result.groupNodes).toEqual([]);
  });

  it('creates group nodes for each agent', () => {
    const nodes = [
      makeSkillNode('agent-a', 0),
      makeSkillNode('agent-a', 1),
      makeSkillNode('agent-b', 0),
    ];
    const result = GraphLayout.layout(nodes, []);
    expect(result.groupNodes.length).toBe(2);
    expect(result.skillNodes.length).toBe(3);
  });

  it('arranges same-agent skills horizontally (left to right)', () => {
    const nodes = [
      makeSkillNode('agent-a', 0),
      makeSkillNode('agent-a', 1),
      makeSkillNode('agent-a', 2),
    ];
    const result = GraphLayout.layout(nodes, []);

    const skill0 = result.skillNodes.find(n => n.id === 'agent-a::0')!;
    const skill1 = result.skillNodes.find(n => n.id === 'agent-a::1')!;
    const skill2 = result.skillNodes.find(n => n.id === 'agent-a::2')!;

    expect(skill0.position.x).toBeLessThan(skill1.position.x);
    expect(skill1.position.x).toBeLessThan(skill2.position.x);
    // Same Y
    expect(skill0.position.y).toBe(skill1.position.y);
    expect(skill1.position.y).toBe(skill2.position.y);
  });

  it('arranges main chain agents in correct vertical order', () => {
    const nodes = [
      makeSkillNode('butterfly-invest-trigger', 0),
      makeSkillNode('butterfly-invest-variable', 0),
      makeSkillNode('butterfly-invest-industry', 0),
      makeSkillNode('butterfly-invest-asset', 0),
    ];

    const result = GraphLayout.layout(nodes, []);

    const trigger = result.skillNodes.find(n => n.data.agent_id.includes('trigger'))!;
    const variable = result.skillNodes.find(n => n.data.agent_id.includes('variable'))!;
    const industry = result.skillNodes.find(n => n.data.agent_id.includes('industry'))!;
    const asset = result.skillNodes.find(n => n.data.agent_id.includes('asset'))!;

    // Each row should have increasing Y
    expect(trigger.position.y).toBeLessThan(variable.position.y);
    expect(variable.position.y).toBeLessThan(industry.position.y);
    expect(industry.position.y).toBeLessThan(asset.position.y);
  });

  it('places crosscut agent row below main chain agents', () => {
    const nodes = [
      makeSkillNode('butterfly-invest-trigger', 0),
      makeSkillNode('butterfly-invest-variable', 0),
      makeSkillNode('butterfly-invest-redteam', 0, { is_crosscut: true }),
    ];

    const result = GraphLayout.layout(nodes, []);

    const mainNodes = result.skillNodes.filter(n => !(n.data as any).is_crosscut);
    const crosscutNodes = result.skillNodes.filter(n => (n.data as any).is_crosscut);

    expect(crosscutNodes.length).toBe(1);
    const maxMainY = Math.max(...mainNodes.map(n => n.position.y));
    expect(crosscutNodes[0].position.y).toBeGreaterThan(maxMainY);
  });
});
