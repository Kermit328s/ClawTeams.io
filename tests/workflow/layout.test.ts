// ============================================================
// GraphLayout 测试
// ============================================================

import { GraphLayout } from '../../src/workflow/layout';
import { WorkflowNode, WorkflowEdge } from '../../src/workflow/types';

function makeNode(id: string, overrides?: Partial<WorkflowNode['data']>): WorkflowNode {
  return {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      agent_id: id,
      name: id,
      emoji: '',
      role: '',
      status: 'idle',
      model: '',
      is_crosscut: false,
      execution_stats: { today_total: 0, today_succeeded: 0, today_failed: 0 },
      ...overrides,
    },
  };
}

function makeEdge(source: string, target: string, type: WorkflowEdge['type'] = 'collaboration'): WorkflowEdge {
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
    expect(result).toEqual([]);
  });

  it('handles single node', () => {
    const nodes = [makeNode('a')];
    const result = GraphLayout.layout(nodes, []);
    expect(result.length).toBe(1);
    expect(result[0].position.x).toBeGreaterThan(0);
  });

  it('arranges main chain nodes left to right', () => {
    const nodes = [
      makeNode('butterfly-invest-trigger'),
      makeNode('butterfly-invest-variable'),
      makeNode('butterfly-invest-industry'),
      makeNode('butterfly-invest-asset'),
    ];
    const edges = [
      makeEdge('butterfly-invest-trigger', 'butterfly-invest-variable', 'sequence'),
      makeEdge('butterfly-invest-variable', 'butterfly-invest-industry', 'sequence'),
      makeEdge('butterfly-invest-industry', 'butterfly-invest-asset', 'sequence'),
    ];

    const result = GraphLayout.layout(nodes, edges);

    // 节点应该按拓扑顺序从左到右排列
    const trigger = result.find(n => n.id === 'butterfly-invest-trigger')!;
    const variable = result.find(n => n.id === 'butterfly-invest-variable')!;
    const industry = result.find(n => n.id === 'butterfly-invest-industry')!;
    const asset = result.find(n => n.id === 'butterfly-invest-asset')!;

    expect(trigger.position.x).toBeLessThan(variable.position.x);
    expect(variable.position.x).toBeLessThan(industry.position.x);
    expect(industry.position.x).toBeLessThan(asset.position.x);
  });

  it('places crosscut nodes below main chain', () => {
    const nodes = [
      makeNode('butterfly-invest-trigger'),
      makeNode('butterfly-invest-variable'),
      makeNode('butterfly-invest-redteam', { is_crosscut: true }),
    ];
    const edges = [
      makeEdge('butterfly-invest-trigger', 'butterfly-invest-variable', 'sequence'),
    ];

    const result = GraphLayout.layout(nodes, edges);

    const mainNodes = result.filter(n => !n.data.is_crosscut);
    const crosscutNodes = result.filter(n => n.data.is_crosscut);

    expect(crosscutNodes.length).toBe(1);
    // 横切节点的 y 应该大于主链节点
    const maxMainY = Math.max(...mainNodes.map(n => n.position.y));
    expect(crosscutNodes[0].position.y).toBeGreaterThan(maxMainY);
  });

  it('places orchestrator above main chain', () => {
    const nodes = [
      makeNode('butterfly-invest', { name: 'Butterfly' }),
      makeNode('butterfly-invest-trigger'),
      makeNode('butterfly-invest-variable'),
    ];
    const edges = [
      makeEdge('butterfly-invest-trigger', 'butterfly-invest-variable', 'sequence'),
    ];

    const result = GraphLayout.layout(nodes, edges);

    const orchestrator = result.find(n => n.id === 'butterfly-invest')!;
    const mainNodes = result.filter(n =>
      n.id !== 'butterfly-invest' && !n.data.is_crosscut
    );
    const minMainY = Math.min(...mainNodes.map(n => n.position.y));

    expect(orchestrator.position.y).toBeLessThan(minMainY);
  });

  it('maintains horizontal gap of 250px', () => {
    const nodes = [
      makeNode('a'),
      makeNode('b'),
      makeNode('c'),
    ];
    const edges = [
      makeEdge('a', 'b', 'sequence'),
      makeEdge('b', 'c', 'sequence'),
    ];

    const result = GraphLayout.layout(nodes, edges);

    const a = result.find(n => n.id === 'a')!;
    const b = result.find(n => n.id === 'b')!;
    const c = result.find(n => n.id === 'c')!;

    expect(b.position.x - a.position.x).toBe(250);
    expect(c.position.x - b.position.x).toBe(250);
  });

  it('uses topological sort for node ordering', () => {
    // Nodes passed in wrong order, but edges define correct order
    const nodes = [
      makeNode('c'),
      makeNode('a'),
      makeNode('b'),
    ];
    const edges = [
      makeEdge('a', 'b', 'sequence'),
      makeEdge('b', 'c', 'sequence'),
    ];

    const result = GraphLayout.layout(nodes, edges);

    const a = result.find(n => n.id === 'a')!;
    const b = result.find(n => n.id === 'b')!;
    const c = result.find(n => n.id === 'c')!;

    expect(a.position.x).toBeLessThan(b.position.x);
    expect(b.position.x).toBeLessThan(c.position.x);
  });
});
