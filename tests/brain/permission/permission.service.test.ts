/**
 * PermissionService 单元测试
 */

import { PermissionService } from '../../../src/brain/permission/permission.service';

function createMockPool(queryFn: jest.Mock) {
  return { query: queryFn } as any;
}

function createMockNeo4j(runFn: jest.Mock) {
  return { run: runFn } as any;
}

describe('PermissionService', () => {
  let pgMock: jest.Mock;
  let neo4jMock: jest.Mock;
  let service: PermissionService;

  beforeEach(() => {
    pgMock = jest.fn();
    neo4jMock = jest.fn();
    service = new PermissionService(createMockPool(pgMock), createMockNeo4j(neo4jMock));
  });

  describe('checkPermission', () => {
    it('should allow when role-based permission matches', async () => {
      // Get active bindings
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'binding-001',
          subject_type: 'user',
          subject_id: 'user-001',
          role_id: 'role-001',
          scope_team_id: 'team-001',
          is_override: false,
          granted_by: 'system',
          granted_at: new Date(),
          expires_at: null,
        }],
      });
      // Get role permissions
      pgMock.mockResolvedValueOnce({
        rows: [{
          permissions: [
            { resource_type: '*', resource_id: '*', actions: ['create', 'read', 'update', 'delete'] },
          ],
        }],
      });

      const result = await service.checkPermission({
        subject_type: 'user',
        subject_id: 'user-001',
        resource_type: 'goal',
        resource_id: 'goal-001',
        action: 'read',
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny when no matching permission found', async () => {
      // No bindings
      pgMock.mockResolvedValueOnce({ rows: [] });
      // No derived permissions (no RESPONSIBLE_FOR relationships)
      neo4jMock.mockResolvedValueOnce({ records: [] });

      const result = await service.checkPermission({
        subject_type: 'agent',
        subject_id: 'agent-001',
        resource_type: 'goal',
        resource_id: 'goal-001',
        action: 'delete',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should deny vision-layer modification without confirmation', async () => {
      const result = await service.checkPermission(
        {
          subject_type: 'user',
          subject_id: 'user-001',
          resource_type: 'goal',
          resource_id: 'goal-vision',
          action: 'update',
        },
        {
          target_layer: 'vision',
          confirmed: false,
        },
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('confirmation');
    });

    it('should allow action_item modification freely', async () => {
      // Get bindings
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'b1',
          subject_type: 'user',
          subject_id: 'user-001',
          role_id: 'role-001',
          scope_team_id: 'team-001',
          is_override: false,
          granted_by: 'sys',
          granted_at: new Date(),
        }],
      });
      // Get role
      pgMock.mockResolvedValueOnce({
        rows: [{
          permissions: [
            { resource_type: '*', resource_id: '*', actions: ['create', 'read', 'update', 'delete', 'execute', 'assign'] },
          ],
        }],
      });

      const result = await service.checkPermission(
        {
          subject_type: 'user',
          subject_id: 'user-001',
          resource_type: 'task',
          resource_id: 'task-001',
          action: 'update',
        },
        { target_layer: 'action_item' },
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('derivePermissions', () => {
    it('should derive scope, upper, and lower permissions from RESPONSIBLE_FOR', async () => {
      // Find responsible goals
      neo4jMock.mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            switch (key) {
              case 'goal_id': return 'goal-strategy';
              case 'layer': return 'strategy';
              case 'team_id': return 'team-001';
              default: return null;
            }
          },
        }],
      });
      // Find child goals
      neo4jMock.mockResolvedValueOnce({
        records: [
          { get: () => 'goal-phase-1' },
          { get: () => 'goal-phase-2' },
        ],
      });
      // Find parent goals
      neo4jMock.mockResolvedValueOnce({
        records: [{ get: () => 'goal-vision' }],
      });

      const derived = await service.derivePermissions('user', 'user-001');

      expect(derived.scope_permissions).toHaveLength(1);
      expect(derived.scope_permissions[0].actions).toContain('create');
      expect(derived.scope_permissions[0].actions).toContain('delete');

      expect(derived.lower_layer_permissions).toHaveLength(2);
      expect(derived.lower_layer_permissions[0].actions).toContain('admin' as any);

      expect(derived.upper_layer_permissions).toHaveLength(1);
      expect(derived.upper_layer_permissions[0].actions).toEqual(['read']);
    });
  });

  describe('createBinding', () => {
    it('should create permission binding in PG', async () => {
      pgMock.mockResolvedValueOnce({
        rows: [{
          id: 'binding-new',
          subject_type: 'user',
          subject_id: 'user-001',
          role_id: 'role-001',
          scope_team_id: 'team-001',
          is_override: false,
          granted_by: 'admin-001',
          granted_at: new Date(),
          expires_at: null,
        }],
      });

      const binding = await service.createBinding({
        subject_type: 'user',
        subject_id: 'user-001',
        role_id: 'role-001',
        scope_team_id: 'team-001',
        is_override: false,
        granted_by: 'admin-001',
      });

      expect(binding.binding_id).toBe('binding-new');
    });
  });
});
