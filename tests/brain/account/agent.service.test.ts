/**
 * AgentService 单元测试
 */

import { AgentService, AgentError } from '../../../src/brain/account/agent.service';

// ─── Mock helpers ───
function createMockPool(queryFn: jest.Mock) {
  return { query: queryFn } as any;
}

function createMockNeo4j(runFn: jest.Mock) {
  return { run: runFn } as any;
}

describe('AgentService', () => {
  let pgMock: jest.Mock;
  let neo4jMock: jest.Mock;
  let service: AgentService;

  beforeEach(() => {
    pgMock = jest.fn();
    neo4jMock = jest.fn();
    service = new AgentService(createMockPool(pgMock), createMockNeo4j(neo4jMock));
  });

  describe('create', () => {
    it('should create agent with API key and register in Neo4j', async () => {
      // PG insert
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'agent-001',
          name: 'CodeReviewer',
          team_id: 'team-001',
          status: 'offline',
          capabilities: [{ name: 'code_review', version: '1.0' }],
          is_active: true,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
          last_active_at: null,
        }],
      });

      // Neo4j create agent + relationships
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const result = await service.create(
        {
          name: 'CodeReviewer',
          team_id: 'team-001',
          capabilities: [{ name: 'code_review', version: '1.0' }],
        },
        'user-001',
      );

      expect(result.agent_id).toBe('agent-001');
      expect(result.name).toBe('CodeReviewer');
      expect(result.api_key).toBeDefined();
      expect(result.api_key.startsWith('ct_')).toBe(true);
      expect(pgMock).toHaveBeenCalledTimes(1);
      expect(neo4jMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getById', () => {
    it('should return agent by ID', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'agent-001',
          name: 'TestAgent',
          team_id: 'team-001',
          status: 'online',
          capabilities: JSON.stringify([{ name: 'test', version: '1.0' }]),
          api_key_hash: 'hash123',
          api_key_prefix: 'ct_abcdefgh',
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
          last_active_at: new Date('2026-01-15'),
        }],
      });

      const agent = await service.getById('agent-001');
      expect(agent).not.toBeNull();
      expect(agent!.agent_id).toBe('agent-001');
      expect(agent!.capabilities).toHaveLength(1);
    });

    it('should return null for non-existent agent', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });
      const agent = await service.getById('nonexistent');
      expect(agent).toBeNull();
    });
  });

  describe('transferOwnership', () => {
    it('should transfer ownership via Neo4j', async () => {
      neo4jMock.mockResolvedValueOnce({ records: [] });

      await service.transferOwnership({
        agent_id: 'agent-001',
        new_owner_id: 'user-002',
      });

      expect(neo4jMock).toHaveBeenCalledTimes(1);
      const cypher = neo4jMock.mock.calls[0][0] as string;
      expect(cypher).toContain('DELETE r');
      expect(cypher).toContain('OWNS');
    });
  });

  describe('handleUserDeparture', () => {
    it('should unbind all agents and return their IDs', async () => {
      // Get owned agents
      neo4jMock.mockResolvedValueOnce({
        records: [
          { get: (key: string) => key === 'agent_id' ? 'agent-001' : null },
          { get: (key: string) => key === 'agent_id' ? 'agent-002' : null },
        ],
      });
      // Unbind all
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const agentIds = await service.handleUserDeparture('user-001');
      expect(agentIds).toEqual(['agent-001', 'agent-002']);
      expect(neo4jMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateCapabilities', () => {
    it('should update capabilities in PG and Neo4j', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'agent-001',
          name: 'Agent',
          team_id: 'team-001',
          status: 'online',
          capabilities: JSON.stringify([{ name: 'new_cap', version: '2.0' }]),
          api_key_hash: 'hash',
          api_key_prefix: 'ct_prefix',
          created_at: new Date(),
          updated_at: new Date(),
          last_active_at: null,
        }],
      });
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const agent = await service.updateCapabilities('agent-001', [
        { name: 'new_cap', version: '2.0' },
      ]);

      expect(agent.capabilities[0].name).toBe('new_cap');
      expect(pgMock).toHaveBeenCalledTimes(1);
      expect(neo4jMock).toHaveBeenCalledTimes(1);
    });

    it('should throw AGENT_NOT_FOUND if agent missing', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.updateCapabilities('nonexistent', []),
      ).rejects.toThrow(AgentError);
    });
  });
});
