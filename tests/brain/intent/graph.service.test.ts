/**
 * IntentGraphService 单元测试
 */

import { IntentGraphService } from '../../../src/brain/intent/graph.service';

function createMockNeo4j(runFn: jest.Mock) {
  return { run: runFn } as any;
}

describe('IntentGraphService', () => {
  let neo4jMock: jest.Mock;
  let service: IntentGraphService;

  beforeEach(() => {
    neo4jMock = jest.fn();
    service = new IntentGraphService(createMockNeo4j(neo4jMock));
  });

  describe('createGoal', () => {
    it('should create a vision-layer goal', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: () => ({
            properties: {
              id: 'goal-001',
              title: 'Build ClawTeams',
              description: 'Our vision',
              status: 'active',
              priority: 'critical',
              team_id: 'team-001',
              layer: 'vision',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          }),
        }],
      });

      const goal = await service.createGoal({
        title: 'Build ClawTeams',
        description: 'Our vision',
        team_id: 'team-001',
        priority: 'critical',
        layer: 'vision',
      });

      expect(goal.id).toBe('goal-001');
      expect(goal.title).toBe('Build ClawTeams');
      expect(goal.type).toBe('Goal');
      expect(goal.status).toBe('active');
    });

    it('should create a child goal with BELONGS_TO edge', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: () => ({
            properties: {
              id: 'goal-002',
              title: 'Q2 Plan',
              status: 'active',
              priority: 'high',
              team_id: 'team-001',
              layer: 'phase_plan',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          }),
        }],
      });
      // BELONGS_TO edge creation
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const goal = await service.createGoal({
        title: 'Q2 Plan',
        team_id: 'team-001',
        priority: 'high',
        layer: 'phase_plan',
        parent_id: 'goal-001',
      });

      expect(goal.id).toBe('goal-002');
      expect(neo4jMock).toHaveBeenCalledTimes(2);
      const secondCallCypher = neo4jMock.mock.calls[1][0] as string;
      expect(secondCallCypher).toContain('BELONGS_TO');
    });
  });

  describe('updateGoal', () => {
    it('should update goal status', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: () => ({
            properties: {
              id: 'goal-001',
              title: 'Goal',
              status: 'completed',
              priority: 'medium',
              team_id: 'team-001',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
            },
          }),
        }],
      });

      const goal = await service.updateGoal('goal-001', { status: 'completed' });
      expect(goal).not.toBeNull();
      expect(goal!.status).toBe('completed');
    });

    it('should return null for non-existent goal', async () => {
      neo4jMock.mockResolvedValueOnce({ records: [] });
      const goal = await service.updateGoal('nonexistent', { title: 'New' });
      expect(goal).toBeNull();
    });
  });

  describe('deleteGoal', () => {
    it('should cascade delete goal and children', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{ get: () => 1 }],
      });

      const deleted = await service.deleteGoal('goal-001');
      expect(deleted).toBe(true);
      const cypher = neo4jMock.mock.calls[0][0] as string;
      expect(cypher).toContain('DETACH DELETE');
    });
  });

  describe('listGoals', () => {
    it('should list goals filtered by team and status', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [
          {
            get: () => ({
              properties: {
                id: 'g1', title: 'Goal 1', status: 'active', priority: 'high',
                team_id: 'team-001', created_at: '2026-01-01', updated_at: '2026-01-01',
              },
            }),
          },
        ],
      });

      const goals = await service.listGoals('team-001', 'active');
      expect(goals).toHaveLength(1);
      expect(goals[0].id).toBe('g1');
    });
  });

  describe('createEdge', () => {
    it('should create a DEPENDS_ON edge', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            switch (key) {
              case 'from_id': return 'task-001';
              case 'to_id': return 'task-002';
              case 'edge_type': return 'DEPENDS_ON';
              case 'weight': return 1.0;
              case 'condition_expr': return null;
              case 'created_at': return '2026-01-01T00:00:00Z';
              default: return null;
            }
          },
        }],
      });

      const edge = await service.createEdge({
        from_id: 'task-001',
        to_id: 'task-002',
        edge_type: 'DEPENDS_ON',
        weight: 1.0,
      });

      expect(edge.from_id).toBe('task-001');
      expect(edge.to_id).toBe('task-002');
      expect(edge.edge_type).toBe('DEPENDS_ON');
    });
  });
});
