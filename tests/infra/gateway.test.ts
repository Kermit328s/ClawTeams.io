/**
 * 网关路由注册和配置测试
 * 验证 Gateway 配置类型和导出完整性
 */

import type {
  GatewayConfig,
  AuthContext,
} from '../../src/infra/gateway';

import {
  createGateway,
  startGateway,
  jwtAuthHook,
  verifyJwt,
  signJwt,
  JwtError,
  apiKeyAuthHook,
  hashApiKey,
  extractKeyPrefix,
  generateApiKey,
  ApiKeyError,
} from '../../src/infra/gateway';

describe('Gateway exports', () => {
  it('should export createGateway function', () => {
    expect(typeof createGateway).toBe('function');
  });

  it('should export startGateway function', () => {
    expect(typeof startGateway).toBe('function');
  });

  it('should export jwtAuthHook function', () => {
    expect(typeof jwtAuthHook).toBe('function');
  });

  it('should export apiKeyAuthHook function', () => {
    expect(typeof apiKeyAuthHook).toBe('function');
  });

  it('should export JWT utility functions', () => {
    expect(typeof verifyJwt).toBe('function');
    expect(typeof signJwt).toBe('function');
  });

  it('should export API Key utility functions', () => {
    expect(typeof hashApiKey).toBe('function');
    expect(typeof extractKeyPrefix).toBe('function');
    expect(typeof generateApiKey).toBe('function');
  });

  it('should export error classes', () => {
    expect(JwtError).toBeDefined();
    expect(ApiKeyError).toBeDefined();
  });
});

describe('GatewayConfig type', () => {
  it('should define all required fields', () => {
    const config: GatewayConfig = {
      port: 3000,
      host: '0.0.0.0',
      jwtSecret: 'test-secret',
      pgConnectionString: 'postgresql://localhost:5432/test',
    };
    expect(config.port).toBe(3000);
  });

  it('should accept optional fields', () => {
    const config: GatewayConfig = {
      port: 3000,
      host: '0.0.0.0',
      jwtSecret: 'test-secret',
      pgConnectionString: 'postgresql://localhost:5432/test',
      logLevel: 'debug',
      corsOrigin: ['http://localhost:3000'],
    };
    expect(config.logLevel).toBe('debug');
  });
});

describe('AuthContext type', () => {
  it('should define JWT auth context', () => {
    const ctx: AuthContext = {
      auth_type: 'jwt',
      subject_type: 'user',
      subject_id: 'user-001',
      team_id: 'team-001',
      roles: ['team_member'],
    };
    expect(ctx.auth_type).toBe('jwt');
  });

  it('should define API Key auth context', () => {
    const ctx: AuthContext = {
      auth_type: 'api_key',
      subject_type: 'agent',
      subject_id: 'agent-001',
      team_id: 'team-001',
      roles: ['agent_worker'],
    };
    expect(ctx.auth_type).toBe('api_key');
  });
});

describe('jwtAuthHook', () => {
  it('should return an async function (Fastify hook)', () => {
    const hook = jwtAuthHook('test-secret');
    expect(typeof hook).toBe('function');
  });
});

describe('apiKeyAuthHook', () => {
  it('should return an async function (Fastify hook)', () => {
    const hook = apiKeyAuthHook('postgresql://localhost/test');
    expect(typeof hook).toBe('function');
  });
});
