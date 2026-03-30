/**
 * TeamService 单元测试
 */

import { TeamService } from '../../../src/brain/account/team.service';

function createMockPool(queryFn: jest.Mock) {
  return { query: queryFn } as any;
}

function createMockNeo4j(runFn: jest.Mock) {
  return { run: runFn } as any;
}

describe('TeamService', () => {
  let pgMock: jest.Mock;
  let neo4jMock: jest.Mock;
  let service: TeamService;

  beforeEach(() => {
    pgMock = jest.fn();
    neo4jMock = jest.fn();
    service = new TeamService(createMockPool(pgMock), createMockNeo4j(neo4jMock));
  });

  describe('create', () => {
    it('should create a team and add owner as member', async () => {
      // 1. INSERT teams
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'team-001',
          name: 'My Team',
          description: 'A great team',
          owner_id: 'user-001',
          is_active: true,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
        }],
      });
      // 2. INSERT team_members (auto-add owner)
      pgMock.mockResolvedValueOnce({ rows: [] });
      // 3. Neo4j MERGE Team node
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const team = await service.create({
        name: 'My Team',
        owner_id: 'user-001',
        description: 'A great team',
      });

      expect(team.team_id).toBe('team-001');
      expect(team.name).toBe('My Team');
      expect(team.owner_id).toBe('user-001');
      expect(pgMock).toHaveBeenCalledTimes(2);
      expect(neo4jMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getById', () => {
    it('should return team by ID', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'team-001',
          name: 'My Team',
          description: null,
          owner_id: 'user-001',
          is_active: true,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
        }],
      });

      const team = await service.getById('team-001');
      expect(team).not.toBeNull();
      expect(team!.team_id).toBe('team-001');
      expect(team!.name).toBe('My Team');
    });

    it('should return null for non-existent team', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });

      const team = await service.getById('nonexistent');
      expect(team).toBeNull();
    });
  });

  describe('listByUser', () => {
    it('should return teams the user belongs to', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'team-001',
            name: 'Team A',
            description: null,
            owner_id: 'user-001',
            is_active: true,
            created_at: new Date('2026-01-01'),
            updated_at: new Date('2026-01-01'),
          },
          {
            id: 'team-002',
            name: 'Team B',
            description: 'Second team',
            owner_id: 'user-002',
            is_active: true,
            created_at: new Date('2026-02-01'),
            updated_at: new Date('2026-02-01'),
          },
        ],
      });

      const teams = await service.listByUser('user-001');
      expect(teams).toHaveLength(2);
      expect(teams[0].team_id).toBe('team-001');
      expect(teams[1].team_id).toBe('team-002');
    });

    it('should return empty array when user has no teams', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });

      const teams = await service.listByUser('user-no-teams');
      expect(teams).toHaveLength(0);
    });
  });

  describe('addMember', () => {
    it('should add a member to the team', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });

      await service.addMember('team-001', 'user-002');

      expect(pgMock).toHaveBeenCalledTimes(1);
      expect(pgMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO team_members'),
        ['team-001', 'user-002'],
      );
    });
  });

  describe('removeMember', () => {
    it('should remove a member from the team', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });

      await service.removeMember('team-001', 'user-002');

      expect(pgMock).toHaveBeenCalledTimes(1);
      expect(pgMock).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM team_members'),
        ['team-001', 'user-002'],
      );
    });
  });

  describe('listMembers', () => {
    it('should list all members of a team', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [
          { user_id: 'user-001', team_id: 'team-001', joined_at: new Date('2026-01-01') },
          { user_id: 'user-002', team_id: 'team-001', joined_at: new Date('2026-01-15') },
        ],
      });

      const members = await service.listMembers('team-001');
      expect(members).toHaveLength(2);
      expect(members[0].user_id).toBe('user-001');
      expect(members[1].user_id).toBe('user-002');
    });

    it('should return empty array for team with no members', async () => {
      pgMock.mockResolvedValueOnce({ rows: [] });

      const members = await service.listMembers('team-empty');
      expect(members).toHaveLength(0);
    });
  });
});
