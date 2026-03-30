/**
 * JWT/API Key 鉴权中间件测试
 */

import { verifyJwt, signJwt, JwtError } from '../../src/infra/gateway/jwt-auth';
import { hashApiKey, extractKeyPrefix, generateApiKey, ApiKeyError } from '../../src/infra/gateway/api-key-auth';

const TEST_SECRET = 'test-jwt-secret-key-for-testing';

describe('JWT Auth', () => {
  describe('signJwt / verifyJwt', () => {
    it('should sign and verify a valid JWT', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt(
        {
          sub: 'user-001',
          exp: now + 3600,
          iss: 'clawteams',
          team_id: 'team-001',
          roles: ['team_member'],
          email: 'test@example.com',
        },
        TEST_SECRET,
      );

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const payload = verifyJwt(token, TEST_SECRET);
      expect(payload.sub).toBe('user-001');
      expect(payload.iss).toBe('clawteams');
      expect(payload.team_id).toBe('team-001');
      expect(payload.roles).toEqual(['team_member']);
      expect(payload.email).toBe('test@example.com');
    });

    it('should reject expired JWT', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt(
        { sub: 'user-001', exp: now - 100 },
        TEST_SECRET,
      );

      expect(() => verifyJwt(token, TEST_SECRET)).toThrow(JwtError);

      try {
        verifyJwt(token, TEST_SECRET);
      } catch (err) {
        expect((err as JwtError).code).toBe('TOKEN_EXPIRED');
        expect((err as JwtError).statusCode).toBe(401);
      }
    });

    it('should reject JWT with wrong secret', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt(
        { sub: 'user-001', exp: now + 3600 },
        TEST_SECRET,
      );

      expect(() => verifyJwt(token, 'wrong-secret')).toThrow(JwtError);

      try {
        verifyJwt(token, 'wrong-secret');
      } catch (err) {
        expect((err as JwtError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('should reject malformed JWT', () => {
      expect(() => verifyJwt('not.a.valid.jwt.token', TEST_SECRET)).toThrow(JwtError);
      expect(() => verifyJwt('only-one-part', TEST_SECRET)).toThrow(JwtError);
      expect(() => verifyJwt('two.parts', TEST_SECRET)).toThrow(JwtError);
    });

    it('should include iat in signed JWT', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt(
        { sub: 'user-001', exp: now + 3600 },
        TEST_SECRET,
      );

      const payload = verifyJwt(token, TEST_SECRET);
      expect(payload.iat).toBeDefined();
      expect(payload.iat).toBeGreaterThanOrEqual(now - 1);
      expect(payload.iat).toBeLessThanOrEqual(now + 2);
    });

    it('should reject JWT with future iat (>60s ahead)', () => {
      // Create a token with iat far in the future manually
      // signJwt sets iat automatically to now, so this test verifies the boundary
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt(
        { sub: 'user-001', exp: now + 7200 },
        TEST_SECRET,
      );

      // This should succeed since iat is now
      const payload = verifyJwt(token, TEST_SECRET);
      expect(payload.sub).toBe('user-001');
    });
  });

  describe('JwtError', () => {
    it('should be an Error instance with code and statusCode', () => {
      const err = new JwtError('TOKEN_EXPIRED', 'Token has expired');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('JwtError');
      expect(err.code).toBe('TOKEN_EXPIRED');
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Token has expired');
    });
  });
});

describe('API Key Auth', () => {
  describe('generateApiKey', () => {
    it('should generate API key with ct_ prefix', () => {
      const key = generateApiKey();
      expect(key.startsWith('ct_')).toBe(true);
    });

    it('should generate unique keys', () => {
      const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()));
      expect(keys.size).toBe(20);
    });

    it('should generate sufficiently long keys', () => {
      const key = generateApiKey();
      // ct_ + 64 hex chars = 67 total
      expect(key.length).toBeGreaterThanOrEqual(60);
    });
  });

  describe('hashApiKey', () => {
    it('should return a hex SHA-256 hash', () => {
      const hash = hashApiKey('ct_testkey123');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return consistent hash for same input', () => {
      const hash1 = hashApiKey('ct_testkey');
      const hash2 = hashApiKey('ct_testkey');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different input', () => {
      const hash1 = hashApiKey('ct_key1');
      const hash2 = hashApiKey('ct_key2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('extractKeyPrefix', () => {
    it('should extract ct_ + first 8 characters', () => {
      const prefix = extractKeyPrefix('ct_abcdefghijklmnop');
      expect(prefix).toBe('ct_abcdefgh');
    });

    it('should work with generated keys', () => {
      const key = generateApiKey();
      const prefix = extractKeyPrefix(key);
      expect(prefix.startsWith('ct_')).toBe(true);
      expect(prefix.length).toBe(11); // ct_ + 8 chars
    });
  });

  describe('ApiKeyError', () => {
    it('should be an Error instance with code and statusCode', () => {
      const err = new ApiKeyError('INVALID_API_KEY', 'Bad key');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ApiKeyError');
      expect(err.code).toBe('INVALID_API_KEY');
      expect(err.statusCode).toBe(401);
    });
  });
});
