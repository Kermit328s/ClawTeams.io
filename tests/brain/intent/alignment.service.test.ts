/**
 * AlignmentService 单元测试
 */

import { AlignmentService } from '../../../src/brain/intent/alignment.service';

function createMockNeo4j(runFn: jest.Mock) {
  return { run: runFn } as any;
}

describe('AlignmentService', () => {
  let neo4jMock: jest.Mock;
  let service: AlignmentService;

  beforeEach(() => {
    neo4jMock = jest.fn();
    service = new AlignmentService(createMockNeo4j(neo4jMock));
  });

  describe('checkWorkflowAlignment', () => {
    it('should return aligned when intent node exists and is active', async () => {
      // Check intent node exists
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            switch (key) {
              case 'id': return 'goal-001';
              case 'layer': return 'strategy';
              case 'status': return 'active';
              default: return null;
            }
          },
        }],
      });
      // Create RELATES_TO relationship
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const result = await service.checkWorkflowAlignment('task-001', 'goal-001');

      expect(result.aligned).toBe(true);
      expect(result.status).toBe('aligned');
      expect(result.intent_node_id).toBe('goal-001');
    });

    it('should mark as intent_orphan when no intent specified and none exists', async () => {
      // Check existing relationships
      neo4jMock.mockResolvedValueOnce({ records: [] });
      // Mark as orphan
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const result = await service.checkWorkflowAlignment('task-orphan');

      expect(result.aligned).toBe(false);
      expect(result.status).toBe('intent_orphan');
    });

    it('should mark as intent_stale when referenced intent is cancelled', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            switch (key) {
              case 'id': return 'goal-old';
              case 'layer': return 'phase_plan';
              case 'status': return 'cancelled';
              default: return null;
            }
          },
        }],
      });

      const result = await service.checkWorkflowAlignment('task-001', 'goal-old');

      expect(result.aligned).toBe(false);
      expect(result.status).toBe('intent_stale');
    });

    it('should return intent_orphan when specified intent does not exist', async () => {
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const result = await service.checkWorkflowAlignment('task-001', 'nonexistent');

      expect(result.aligned).toBe(false);
      expect(result.status).toBe('intent_orphan');
    });
  });

  describe('analyzeIntentImpact', () => {
    it('should find affected workflow nodes', async () => {
      // Direct relationships
      neo4jMock.mockResolvedValueOnce({
        records: [
          { get: () => 'task-001' },
          { get: () => 'task-002' },
        ],
      });
      // Child goal relationships
      neo4jMock.mockResolvedValueOnce({
        records: [{ get: () => 'task-003' }],
      });

      const impact = await service.analyzeIntentImpact('goal-001', 'priority_change');

      expect(impact.affected_workflow_nodes).toHaveLength(3);
      expect(impact.impact_type).toBe('priority_change');
      expect(impact.suggested_actions.length).toBeGreaterThan(0);
    });
  });

  describe('batchCheckAlignment', () => {
    it('should check multiple workflow nodes', async () => {
      // First node: aligned
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: (key: string) => key === 'id' ? 'goal-001' : 'strategy',
        }],
      });
      // Second node: orphan
      neo4jMock.mockResolvedValueOnce({ records: [] });
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const results = await service.batchCheckAlignment(['task-1', 'task-2']);

      expect(results).toHaveLength(2);
    });
  });
});
