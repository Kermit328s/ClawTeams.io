/**
 * UserService 单元测试
 */

import { UserService, AccountError } from '../../../src/brain/account/user.service';

// ─── Mock Pool ───
function createMockPool(queryFn: jest.Mock) {
  return { query: queryFn } as any;
}

const JWT_SECRET = 'test-secret-key';

describe('UserService', () => {
  let queryMock: jest.Mock;
  let service: UserService;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new UserService(createMockPool(queryMock), JWT_SECRET);
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      // 第一次查询：检查邮箱不存在
      queryMock.mockResolvedValueOnce({ rows: [] });
      // 第二次查询：插入用户
      queryMock.mockResolvedValueOnce({
        rows: [{
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com',
          display_name: 'Test User',
          avatar_url: null,
          is_active: true,
          email_verified: false,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
        }],
      });

      const user = await service.register({
        email: 'test@example.com',
        display_name: 'Test User',
        password: 'secure123',
      });

      expect(user.email).toBe('test@example.com');
      expect(user.display_name).toBe('Test User');
      expect(user.is_active).toBe(true);
      expect(queryMock).toHaveBeenCalledTimes(2);
    });

    it('should throw EMAIL_EXISTS for duplicate email', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      await expect(
        service.register({ email: 'dup@example.com', display_name: 'Dup', password: 'pass' }),
      ).rejects.toThrow(AccountError);

      try {
        queryMock.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
        await service.register({ email: 'dup@example.com', display_name: 'Dup', password: 'pass' });
      } catch (err) {
        expect((err as AccountError).code).toBe('EMAIL_EXISTS');
        expect((err as AccountError).statusCode).toBe(409);
      }
    });
  });

  describe('login', () => {
    it('should throw INVALID_CREDENTIALS for non-existent user', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.login({ email: 'nobody@example.com', password: 'pass' }),
      ).rejects.toThrow(AccountError);
    });

    it('should throw ACCOUNT_DISABLED for inactive user', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{
          id: 'u1',
          email: 'disabled@example.com',
          display_name: 'Disabled',
          is_active: false,
          password_hash: 'salt$hash',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      await expect(
        service.login({ email: 'disabled@example.com', password: 'pass' }),
      ).rejects.toThrow(AccountError);
    });

    it('should login successfully with correct credentials', async () => {
      // hashPassword('correct-pass', 'test-salt') => sha256('test-salt:correct-pass')
      const { createHash } = require('crypto');
      const salt = 'test-salt';
      const hash = createHash('sha256').update(`${salt}:correct-pass`).digest('hex');
      const passwordHash = `${salt}$${hash}`;

      // 1. SELECT user
      queryMock.mockResolvedValueOnce({
        rows: [{
          id: 'u1',
          email: 'user@example.com',
          display_name: 'Test User',
          avatar_url: null,
          is_active: true,
          email_verified: true,
          password_hash: passwordHash,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
        }],
      });
      // 2. SELECT roles
      queryMock.mockResolvedValueOnce({ rows: [{ name: 'member' }] });
      // 3. SELECT team_members
      queryMock.mockResolvedValueOnce({ rows: [{ team_id: 'team-001' }] });
      // 4. INSERT user_sessions
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.login({ email: 'user@example.com', password: 'correct-pass' });

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.user.id).toBe('u1');
      expect(result.user.email).toBe('user@example.com');
      expect(result.expires_in).toBe(3600);
    });

    it('should throw INVALID_CREDENTIALS for wrong password', async () => {
      const { createHash } = require('crypto');
      const salt = 'test-salt';
      const hash = createHash('sha256').update(`${salt}:correct-pass`).digest('hex');
      const passwordHash = `${salt}$${hash}`;

      queryMock.mockResolvedValueOnce({
        rows: [{
          id: 'u1',
          email: 'user@example.com',
          display_name: 'Test User',
          is_active: true,
          password_hash: passwordHash,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-pass' }),
      ).rejects.toThrow(AccountError);
    });
  });

  describe('refreshAccessToken', () => {
    it('should return a new access token for valid refresh token', async () => {
      const { createHash } = require('crypto');
      const refreshToken = 'valid-refresh-token';
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

      // 1. SELECT user_sessions JOIN users
      queryMock.mockResolvedValueOnce({
        rows: [{
          user_id: 'u1',
          email: 'user@example.com',
          is_active: true,
        }],
      });
      // 2. SELECT roles
      queryMock.mockResolvedValueOnce({ rows: [{ name: 'member' }] });
      // 3. SELECT team_members
      queryMock.mockResolvedValueOnce({ rows: [{ team_id: 'team-001' }] });

      const result = await service.refreshAccessToken(refreshToken);

      expect(result.access_token).toBeDefined();
      expect(result.expires_in).toBe(3600);
      // Verify the token hash was used in the query
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('user_sessions'),
        [tokenHash],
      );
    });

    it('should throw INVALID_REFRESH_TOKEN for expired/invalid token', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.refreshAccessToken('invalid-token'),
      ).rejects.toThrow(AccountError);
    });

    it('should throw ACCOUNT_DISABLED for disabled user', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{
          user_id: 'u1',
          email: 'user@example.com',
          is_active: false,
        }],
      });

      await expect(
        service.refreshAccessToken('some-token'),
      ).rejects.toThrow(AccountError);
    });
  });

  describe('logout', () => {
    it('should revoke all active sessions for user', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.logout('u1');

      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('user_sessions'),
        ['u1'],
      );
    });
  });

  describe('getById', () => {
    it('should return user by ID', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{
          id: 'u1',
          email: 'user@example.com',
          display_name: 'User',
          avatar_url: null,
          is_active: true,
          email_verified: true,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
        }],
      });

      const user = await service.getById('u1');
      expect(user).not.toBeNull();
      expect(user!.id).toBe('u1');
    });

    it('should return null for non-existent user', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const user = await service.getById('nonexistent');
      expect(user).toBeNull();
    });
  });

  describe('update', () => {
    it('should update user display name', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{
          id: 'u1',
          email: 'user@example.com',
          display_name: 'Updated Name',
          avatar_url: null,
          is_active: true,
          email_verified: true,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-15'),
        }],
      });

      const user = await service.update('u1', { display_name: 'Updated Name' });
      expect(user.display_name).toBe('Updated Name');
    });

    it('should throw USER_NOT_FOUND if user does not exist', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.update('nonexistent', { display_name: 'Name' }),
      ).rejects.toThrow(AccountError);
    });
  });

  describe('deactivate', () => {
    it('should deactivate user and revoke sessions', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // deactivate
      queryMock.mockResolvedValueOnce({ rows: [] }); // logout (revoke sessions)

      await service.deactivate('u1');
      expect(queryMock).toHaveBeenCalledTimes(2);
    });
  });
});
