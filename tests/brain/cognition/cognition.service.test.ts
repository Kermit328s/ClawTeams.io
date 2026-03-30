/**
 * CognitionService 单元测试
 */

import { CognitionService } from '../../../src/brain/cognition/cognition.service';

function createMockNeo4j(runFn: jest.Mock) {
  return { run: runFn } as any;
}

describe('CognitionService', () => {
  let neo4jMock: jest.Mock;
  let service: CognitionService;

  beforeEach(() => {
    neo4jMock = jest.fn();
    service = new CognitionService(createMockNeo4j(neo4jMock), {
      deviationThreshold: 0.3,
      repeatedFailureThreshold: 3,
    });
  });

  describe('evaluateDeviation', () => {
    it('should return null when deviation is within tolerance', async () => {
      const result = await service.evaluateDeviation({
        task_id: 'task-001',
        expected: { score: 0.9 },
        actual: { score: 0.85 },
        deviation_score: 0.2,
        tolerance_threshold: 0.3,
      });

      expect(result).toBeNull();
      expect(neo4jMock).not.toHaveBeenCalled();
    });

    it('should create cognition node when deviation exceeds tolerance', async () => {
      // Query team_id from task
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: () => 'team-001',
        }],
      });
      // Create cognition node
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: () => ({
            properties: {
              id: 'cog-001',
              content: 'Deviation detected',
              source_task_id: 'task-001',
              confidence: 0.5,
              tags: ['auto_detected', 'deviation'],
              team_id: 'team-001',
              stage: 'hypothesis',
              trigger_type: 'hypothesis_invalidated',
              verified: false,
              vetoed: false,
              reference_count: 0,
              created_at: '2026-01-01',
              updated_at: '2026-01-01',
            },
          }),
        }],
      });

      const result = await service.evaluateDeviation({
        task_id: 'task-001',
        expected: { score: 0.9 },
        actual: { score: 0.3 },
        deviation_score: 0.5,
        tolerance_threshold: 0.3,
      });

      expect(result).not.toBeNull();
      expect(result!.stage).toBe('hypothesis');
      expect(result!.trigger_type).toBe('hypothesis_invalidated');
    });
  });

  describe('checkRepeatedFailures', () => {
    it('should return null when failures below threshold', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{ get: () => 2 }],
      });

      const result = await service.checkRepeatedFailures('deploy', 'team-001');
      expect(result).toBeNull();
    });

    it('should create cognition when failures exceed threshold', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{ get: () => 5 }],
      });
      // Create cognition
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: () => ({
            properties: {
              id: 'cog-002',
              content: 'Repeated failure pattern',
              confidence: 0.95,
              tags: ['auto_detected', 'repeated_failure', 'deploy'],
              team_id: 'team-001',
              stage: 'hypothesis',
              trigger_type: 'repeated_failure',
              verified: false,
              vetoed: false,
              reference_count: 0,
              created_at: '2026-01-01',
            },
          }),
        }],
      });

      const result = await service.checkRepeatedFailures('deploy', 'team-001');
      expect(result).not.toBeNull();
      expect(result!.trigger_type).toBe('repeated_failure');
    });
  });

  describe('vetoCognition', () => {
    it('should mark cognition as vetoed', async () => {
      neo4jMock.mockResolvedValueOnce({ records: [] });

      await service.vetoCognition('cog-001', 'user-001');

      expect(neo4jMock).toHaveBeenCalledTimes(1);
      const cypher = neo4jMock.mock.calls[0][0] as string;
      expect(cypher).toContain('vetoed = true');
    });
  });

  describe('updateStage', () => {
    it('should update stage and set verified for validated stage', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: () => ({
            properties: {
              id: 'cog-001',
              content: 'Test',
              confidence: 0.9,
              tags: [],
              team_id: 'team-001',
              stage: 'validated',
              verified: true,
              vetoed: false,
              reference_count: 0,
              created_at: '2026-01-01',
            },
          }),
        }],
      });

      const result = await service.updateStage('cog-001', 'validated');
      expect(result).not.toBeNull();
      expect(result!.stage).toBe('validated');

      const cypher = neo4jMock.mock.calls[0][0] as string;
      expect(cypher).toContain('verified = true');
    });
  });

  describe('getEvolutionChain', () => {
    it('should return evolution chain', async () => {
      neo4jMock.mockResolvedValueOnce({
        records: [
          {
            get: (key: string) => {
              switch (key) {
                case 'from_id': return 'cog-002';
                case 'to_id': return 'cog-001';
                case 'reason': return 'New data contradicts';
                case 'evolution_type': return 'correction';
                case 'evolved_at': return '2026-02-01';
                default: return null;
              }
            },
          },
        ],
      });

      const chain = await service.getEvolutionChain('cog-002');
      expect(chain).toHaveLength(1);
      expect(chain[0].evolution_type).toBe('correction');
    });
  });
});
