/**
 * RollbackService 单元测试
 */

import { RollbackService } from '../../../src/brain/rollback/rollback.service';

function createMockPool(queryFn: jest.Mock) {
  return { query: queryFn } as any;
}

function createMockNeo4j(runFn: jest.Mock) {
  return { run: runFn } as any;
}

describe('RollbackService', () => {
  let pgMock: jest.Mock;
  let neo4jMock: jest.Mock;
  let service: RollbackService;

  beforeEach(() => {
    pgMock = jest.fn();
    neo4jMock = jest.fn();
    service = new RollbackService(createMockPool(pgMock), createMockNeo4j(neo4jMock));
  });

  describe('rollbackSingleAgent', () => {
    it('should rollback a task to target version', async () => {
      // Version exists
      pgMock.mockResolvedValueOnce({
        rows: [{ version: 2, agent_id: 'agent-001', state: 'completed' }],
      });
      // Current pointer
      pgMock.mockResolvedValueOnce({
        rows: [{ current_version: 5 }],
      });
      // Move pointer
      pgMock.mockResolvedValueOnce({ rows: [] });
      // Update Neo4j task state
      neo4jMock.mockResolvedValueOnce({ records: [] });
      // Audit log
      pgMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.rollbackSingleAgent({
        agent_id: 'agent-001',
        task_id: 'task-001',
        target_version: 2,
        reason: 'Bad deployment',
        initiated_by: 'user-001',
      });

      expect(result.success).toBe(true);
      expect(result.rolled_back_tasks).toHaveLength(1);
      expect(result.rolled_back_tasks[0].from_version).toBe(5);
      expect(result.rolled_back_tasks[0].to_version).toBe(2);
    });

    it('should fail when target version does not exist', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.rollbackSingleAgent({
        agent_id: 'agent-001',
        task_id: 'task-001',
        target_version: 99,
        reason: 'Test',
        initiated_by: 'user-001',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('not found');
    });

    it('should be a no-op when already at target version', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [{ version: 3, agent_id: 'agent-001' }],
      });
      pgMock.mockResolvedValueOnce({
        rows: [{ current_version: 3 }],
      });

      const result = await service.rollbackSingleAgent({
        agent_id: 'agent-001',
        task_id: 'task-001',
        target_version: 3,
        reason: 'No-op',
        initiated_by: 'user-001',
      });

      expect(result.success).toBe(true);
      expect(result.rolled_back_tasks).toHaveLength(0);
    });
  });

  describe('rollbackTeam', () => {
    it('should rollback all team tasks to a timestamp', async () => {
      // Find all tasks before timestamp
      pgMock.mockResolvedValueOnce({
        rows: [
          { task_id: 'task-001', agent_id: 'agent-001', target_version: 2 },
          { task_id: 'task-002', agent_id: 'agent-002', target_version: 3 },
        ],
      });

      // For task-001: current pointer, move pointer, get state, update neo4j
      pgMock.mockResolvedValueOnce({ rows: [{ current_version: 5 }] });
      pgMock.mockResolvedValueOnce({ rows: [] }); // move pointer
      pgMock.mockResolvedValueOnce({ rows: [{ state: 'completed' }] });
      neo4jMock.mockResolvedValueOnce({ records: [] });

      // For task-002: current pointer, move pointer, get state, update neo4j
      pgMock.mockResolvedValueOnce({ rows: [{ current_version: 7 }] });
      pgMock.mockResolvedValueOnce({ rows: [] }); // move pointer
      pgMock.mockResolvedValueOnce({ rows: [{ state: 'running' }] });
      neo4jMock.mockResolvedValueOnce({ records: [] });

      // Audit log
      pgMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.rollbackTeam({
        team_id: 'team-001',
        target_timestamp: '2026-03-01T00:00:00Z',
        reason: 'Revert bad release',
        initiated_by: 'user-admin',
      });

      expect(result.success).toBe(true);
      expect(result.rolled_back_tasks).toHaveLength(2);
    });
  });

  describe('getAvailableVersions', () => {
    it('should list available versions for a task', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [
          { version: 3, state: 'completed', created_at: new Date('2026-03-03') },
          { version: 2, state: 'running', created_at: new Date('2026-03-02') },
          { version: 1, state: 'pending', created_at: new Date('2026-03-01') },
        ],
      });

      const versions = await service.getAvailableVersions('task-001');
      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe(3);
      expect(versions[2].version).toBe(1);
    });
  });
});
