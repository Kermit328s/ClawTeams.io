// ============================================================
// GraphMerger 测试 — 技能级版本
// ============================================================

import { GraphMerger } from '../../src/workflow/graph-merger';
import { AgentRegistration } from '../../src/tracker/types';
import { WorkflowNode, WorkflowEdge, AgentGroupNode } from '../../src/workflow/types';

const MOCK_AGENTS: AgentRegistration[] = [
  { agent_id: 'agent-a', name: 'Agent A', emoji: '🅰️', theme: '', model: 'gpt-4', workspace_path: '' },
  { agent_id: 'agent-b', name: 'Agent B', emoji: '🅱️', theme: '', model: 'gpt-4', workspace_path: '' },
  { agent_id: 'agent-c', name: 'Agent C', emoji: '©️', theme: '', model: 'gpt-4', workspace_path: '' },
];

function makeSkillNode(agentId: string, skillIndex: number, skillName: string): WorkflowNode {
  return {
    id: `${agentId}::${skillIndex}`,
    type: 'skill',
    position: { x: 0, y: 0 },
    data: {
      skill_id: `${agentId}::${skillIndex}`,
      agent_id: agentId,
      agent_emoji: '🤖',
      agent_name: agentId,
      skill_name: skillName,
      skill_icon: '⚡',
      skill_index: skillIndex,
      skill_total: 2,
      status: 'idle',
      is_crosscut: false,
      agent_color: '#64748B',
      execution_stats: { total: 0, succeeded: 0, failed: 0, tokens: 0 },
    },
  };
}

function makeGroupNode(agentId: string): AgentGroupNode {
  return {
    id: `group-${agentId}`,
    type: 'agent-group',
    position: { x: 0, y: 0 },
    data: {
      agent_id: agentId,
      agent_name: agentId,
      agent_emoji: '🤖',
      agent_color: '#64748B',
      is_crosscut: false,
      skill_count: 2,
    },
    style: { width: 500, height: 200 },
  };
}

let merger: GraphMerger;

beforeAll(() => {
  merger = new GraphMerger();
});

describe('GraphMerger', () => {
  describe('merge', () => {
    it('includes skill nodes and group nodes in result', () => {
      const skillNodes = [
        makeSkillNode('agent-a', 0, 'Skill 1'),
        makeSkillNode('agent-a', 1, 'Skill 2'),
      ];
      const groupNodes = [makeGroupNode('agent-a')];

      const result = merger.merge(
        MOCK_AGENTS,
        skillNodes,
        [],
        groupNodes,
        [],
        new Map(),
      );

      // 1 group + 2 skill = 3 nodes
      expect(result.nodes.length).toBe(3);
    });

    it('fills agent statuses from runtime data', () => {
      const skillNodes = [
        makeSkillNode('agent-a', 0, 'Skill 1'),
        makeSkillNode('agent-a', 1, 'Skill 2'),
      ];

      const statuses = new Map<string, { status: 'idle' | 'running' | 'failed'; stats: { today_total: number; today_succeeded: number; today_failed: number; today_tokens?: number } }>();
      statuses.set('agent-a', {
        status: 'running',
        stats: { today_total: 6, today_succeeded: 4, today_failed: 2, today_tokens: 1000 },
      });

      const result = merger.merge(
        MOCK_AGENTS,
        skillNodes,
        [],
        [],
        [],
        statuses,
      );

      // Last skill should be running
      const lastSkill = result.nodes.find(n => n.id === 'agent-a::1');
      expect(lastSkill).toBeDefined();
      expect((lastSkill!.data as any).status).toBe('running');
    });

    it('includes metadata with edge counts', () => {
      const skillEdges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'agent-a::0',
          target: 'agent-a::1',
          type: 'internal',
          data: { label: '', strength: 1, source_info: 'skill_chain' },
        },
      ];
      const dynamicEdges: Partial<WorkflowEdge>[] = [
        {
          id: 'e2',
          source: 'agent-b',
          target: 'agent-c',
          type: 'subagent',
          data: { label: 'spawn', strength: 1, source_info: 'hook' },
        },
      ];

      const result = merger.merge(
        MOCK_AGENTS,
        [makeSkillNode('agent-a', 0, 'S1'), makeSkillNode('agent-a', 1, 'S2'),
         makeSkillNode('agent-b', 0, 'S1'), makeSkillNode('agent-c', 0, 'S1')],
        skillEdges,
        [],
        dynamicEdges,
        new Map(),
      );

      expect(result.metadata.static_edge_count).toBe(1);
      expect(result.metadata.dynamic_edge_count).toBe(1);
      expect(result.metadata.generated_at).toBeGreaterThan(0);
    });
  });

  describe('deduplicateEdges', () => {
    it('merges edges with same source, target, and type', () => {
      const edges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'agent-a::0',
          target: 'agent-b::0',
          type: 'cross_agent',
          data: { label: 'from md', strength: 1, source_info: 'md_file' },
        },
        {
          id: 'e2',
          source: 'agent-a::0',
          target: 'agent-b::0',
          type: 'cross_agent',
          data: { label: 'from hook event', strength: 3, source_info: 'hook' },
        },
      ];

      const result = merger.deduplicateEdges(edges);

      expect(result.length).toBe(1);
      expect(result[0].data.strength).toBe(4);
    });

    it('keeps edges with different types separate', () => {
      const edges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'agent-a::0',
          target: 'agent-b::0',
          type: 'internal',
          data: { label: 'internal', strength: 1, source_info: 'md' },
        },
        {
          id: 'e2',
          source: 'agent-a::0',
          target: 'agent-b::0',
          type: 'cross_agent',
          data: { label: 'cross', strength: 1, source_info: 'hook' },
        },
      ];

      const result = merger.deduplicateEdges(edges);
      expect(result.length).toBe(2);
    });

    it('skips edges with missing source or target', () => {
      const edges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'agent-a::0',
          target: undefined as any,
          type: 'internal',
          data: { label: 'bad', strength: 1, source_info: '' },
        },
      ];

      const result = merger.deduplicateEdges(edges);
      expect(result.length).toBe(0);
    });

    it('prefers longer label when merging', () => {
      const edges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'agent-a::0',
          target: 'agent-b::0',
          type: 'cross_agent',
          data: { label: 'short', strength: 1, source_info: 'a' },
        },
        {
          id: 'e2',
          source: 'agent-a::0',
          target: 'agent-b::0',
          type: 'cross_agent',
          data: { label: 'a much longer and more descriptive label', strength: 1, source_info: 'b' },
        },
      ];

      const result = merger.deduplicateEdges(edges);
      expect(result[0].data.label).toBe('a much longer and more descriptive label');
    });
  });
});
