// ============================================================
// GraphMerger 测试
// ============================================================

import { GraphMerger } from '../../src/workflow/graph-merger';
import { AgentRegistration } from '../../src/tracker/types';
import { WorkflowNode, WorkflowEdge } from '../../src/workflow/types';

const MOCK_AGENTS: AgentRegistration[] = [
  { agent_id: 'agent-a', name: 'Agent A', emoji: '🅰️', theme: '', model: 'gpt-4', workspace_path: '' },
  { agent_id: 'agent-b', name: 'Agent B', emoji: '🅱️', theme: '', model: 'gpt-4', workspace_path: '' },
  { agent_id: 'agent-c', name: 'Agent C', emoji: '©️', theme: '', model: 'gpt-4', workspace_path: '' },
];

let merger: GraphMerger;

beforeAll(() => {
  merger = new GraphMerger();
});

describe('GraphMerger', () => {
  describe('merge', () => {
    it('creates nodes for all registered agents', () => {
      const result = merger.merge(
        MOCK_AGENTS,
        { nodes: [], edges: [] },
        [],
        new Map(),
      );

      expect(result.nodes.length).toBe(3);
      expect(result.nodes.map(n => n.id)).toEqual(
        expect.arrayContaining(['agent-a', 'agent-b', 'agent-c']),
      );
    });

    it('preserves static node data (role, is_crosscut)', () => {
      const staticNodes: Partial<WorkflowNode>[] = [
        {
          id: 'agent-a',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            agent_id: 'agent-a',
            name: 'Agent A',
            emoji: '🅰️',
            role: 'Signal detector',
            status: 'idle',
            model: 'gpt-4',
            is_crosscut: false,
            execution_stats: { today_total: 0, today_succeeded: 0, today_failed: 0 },
          },
        },
      ];

      const result = merger.merge(
        MOCK_AGENTS,
        { nodes: staticNodes, edges: [] },
        [],
        new Map(),
      );

      const nodeA = result.nodes.find(n => n.id === 'agent-a')!;
      expect(nodeA.data.role).toBe('Signal detector');
    });

    it('fills agent statuses from runtime data', () => {
      const statuses = new Map<string, { status: 'idle' | 'running' | 'failed'; stats: { today_total: number; today_succeeded: number; today_failed: number } }>();
      statuses.set('agent-a', {
        status: 'running',
        stats: { today_total: 5, today_succeeded: 4, today_failed: 1 },
      });

      const result = merger.merge(
        MOCK_AGENTS,
        { nodes: [], edges: [] },
        [],
        statuses,
      );

      const nodeA = result.nodes.find(n => n.id === 'agent-a')!;
      expect(nodeA.data.status).toBe('running');
      expect(nodeA.data.execution_stats.today_total).toBe(5);
      expect(nodeA.data.execution_stats.today_failed).toBe(1);
    });

    it('includes metadata with edge counts', () => {
      const staticEdges: Partial<WorkflowEdge>[] = [
        {
          id: 'e1',
          source: 'agent-a',
          target: 'agent-b',
          type: 'collaboration',
          data: { label: 'test', strength: 1, source_info: 'md' },
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
        { nodes: [], edges: staticEdges },
        dynamicEdges,
        new Map(),
      );

      expect(result.metadata.static_edge_count).toBe(1);
      expect(result.metadata.dynamic_edge_count).toBe(1);
      expect(result.metadata.data_sources).toEqual(
        expect.arrayContaining(['md', 'hook']),
      );
      expect(result.metadata.generated_at).toBeGreaterThan(0);
    });

    it('adds animation to subagent edges', () => {
      const dynamicEdges: Partial<WorkflowEdge>[] = [
        {
          id: 'e1',
          source: 'agent-a',
          target: 'agent-b',
          type: 'subagent',
          data: { label: 'spawn', strength: 1, source_info: 'hook' },
        },
      ];

      const result = merger.merge(
        MOCK_AGENTS,
        { nodes: [], edges: [] },
        dynamicEdges,
        new Map(),
      );

      const subagentEdge = result.edges.find(e => e.type === 'subagent');
      expect(subagentEdge?.animated).toBe(true);
    });
  });

  describe('deduplicateEdges', () => {
    it('merges edges with same source, target, and type', () => {
      const edges: Partial<WorkflowEdge>[] = [
        {
          id: 'e1',
          source: 'agent-a',
          target: 'agent-b',
          type: 'collaboration',
          data: { label: 'from md', strength: 1, source_info: 'md_file' },
        },
        {
          id: 'e2',
          source: 'agent-a',
          target: 'agent-b',
          type: 'collaboration',
          data: { label: 'from hook event', strength: 3, source_info: 'hook' },
        },
      ];

      const result = merger.deduplicateEdges(edges);

      expect(result.length).toBe(1);
      // strength should accumulate
      expect(result[0].data.strength).toBe(4);
      // source_info should be merged
      expect(result[0].data.source_info).toContain('md_file');
      expect(result[0].data.source_info).toContain('hook');
    });

    it('keeps edges with different types separate', () => {
      const edges: Partial<WorkflowEdge>[] = [
        {
          source: 'agent-a',
          target: 'agent-b',
          type: 'collaboration',
          data: { label: 'collab', strength: 1, source_info: 'md' },
        },
        {
          source: 'agent-a',
          target: 'agent-b',
          type: 'data_flow',
          data: { label: 'data', strength: 1, source_info: 'hook' },
        },
      ];

      const result = merger.deduplicateEdges(edges);
      expect(result.length).toBe(2);
    });

    it('skips edges with missing source or target', () => {
      const edges: Partial<WorkflowEdge>[] = [
        {
          source: 'agent-a',
          target: undefined as any,
          type: 'collaboration',
          data: { label: 'bad', strength: 1, source_info: '' },
        },
      ];

      const result = merger.deduplicateEdges(edges);
      expect(result.length).toBe(0);
    });

    it('prefers longer label when merging', () => {
      const edges: Partial<WorkflowEdge>[] = [
        {
          source: 'agent-a',
          target: 'agent-b',
          type: 'collaboration',
          data: { label: 'short', strength: 1, source_info: 'a' },
        },
        {
          source: 'agent-a',
          target: 'agent-b',
          type: 'collaboration',
          data: { label: 'a much longer and more descriptive label', strength: 1, source_info: 'b' },
        },
      ];

      const result = merger.deduplicateEdges(edges);
      expect(result[0].data.label).toBe('a much longer and more descriptive label');
    });
  });
});
