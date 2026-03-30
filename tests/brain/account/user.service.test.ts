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
