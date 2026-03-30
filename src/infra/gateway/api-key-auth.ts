/**
 * API Key 鉴权中间件
 * 用于龙虾（Agent）的身份认证
 *
 * API Key 格式: ct_<random_string>
 * 存储方式: 数据库中只存 SHA-256 哈希和前缀（ct_xxxx）
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import type { AuthContext } from './server';

// ─── API Key 前缀 ───
const API_KEY_PREFIX = 'ct_';
const API_KEY_HEADER = 'x-agent-api-key';

// ─── API Key 验证结果缓存 ───
interface CachedAgent {
  agent_id: string;
  team_id: string;
  roles: string[];
  cached_at: number;
}

// 简单内存缓存（生产环境应使用 Redis）
const agentCache = new Map<string, CachedAgent>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

// ─── 计算 API Key 哈希 ───
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

// ─── 提取 API Key 前缀（用于快速查找） ───
export function extractKeyPrefix(apiKey: string): string {
  // 保留 ct_ + 前8个字符
  return apiKey.slice(0, API_KEY_PREFIX.length + 8);
}

// ─── 生成 API Key ───
export function generateApiKey(): string {
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${API_KEY_PREFIX}${randomPart}`;
}

// ─── API Key 错误 ───
export class ApiKeyError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiKeyError';
    this.code = code;
    this.statusCode = 401;
  }
}

// ─── 从数据库查询龙虾信息 ───
async function lookupAgentByApiKey(
  apiKeyHash: string,
  apiKeyPrefix: string,
  pgConnectionString: string,
): Promise<CachedAgent | null> {
  // 使用动态导入避免强依赖
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: pgConnectionString, max: 5 });

  try {
    const result = await pool.query(
      `SELECT
        a.id AS agent_id,
        a.team_id,
        a.is_active,
        COALESCE(
          array_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
          '{}'
        ) AS roles
      FROM agents a
      LEFT JOIN permission_bindings pb
        ON pb.subject_type = 'agent'
        AND pb.subject_id = a.id::text
        AND (pb.expires_at IS NULL OR pb.expires_at > NOW())
      LEFT JOIN roles r ON r.id = pb.role_id
      WHERE a.api_key_hash = $1
        AND a.api_key_prefix = $2
        AND a.is_active = TRUE
      GROUP BY a.id, a.team_id, a.is_active`,
      [apiKeyHash, apiKeyPrefix],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      agent_id: row.agent_id,
      team_id: row.team_id,
      roles: row.roles,
      cached_at: Date.now(),
    };
  } finally {
    await pool.end();
  }
}

// ─── 清理过期缓存 ───
function cleanupCache(): void {
  const now = Date.now();
  for (const [key, value] of agentCache.entries()) {
    if (now - value.cached_at > CACHE_TTL_MS) {
      agentCache.delete(key);
    }
  }
}

// 定期清理缓存
setInterval(cleanupCache, CACHE_TTL_MS);

// ─── Fastify API Key 鉴权 Hook ───
export function apiKeyAuthHook(pgConnectionString: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const apiKey = request.headers[API_KEY_HEADER] as string | undefined;

    if (!apiKey) {
      return reply.status(401).send({
        code: 'MISSING_API_KEY',
        message: `${API_KEY_HEADER} header is required`,
      });
    }

    if (!apiKey.startsWith(API_KEY_PREFIX)) {
      return reply.status(401).send({
        code: 'INVALID_API_KEY',
        message: 'Invalid API key format',
      });
    }

    const keyHash = hashApiKey(apiKey);
    const keyPrefix = extractKeyPrefix(apiKey);

    // 检查缓存
    let agent = agentCache.get(keyHash);

    if (!agent || Date.now() - agent.cached_at > CACHE_TTL_MS) {
      // 缓存未命中或已过期，查数据库
      try {
        agent = await lookupAgentByApiKey(keyHash, keyPrefix, pgConnectionString) ?? undefined;
      } catch (err) {
        request.log.error({ err }, 'Failed to lookup agent by API key');
        return reply.status(500).send({
          code: 'INTERNAL_ERROR',
          message: 'Authentication service unavailable',
        });
      }

      if (!agent) {
        return reply.status(401).send({
          code: 'INVALID_API_KEY',
          message: 'API key is invalid or agent is deactivated',
        });
      }

      // 写入缓存
      agentCache.set(keyHash, agent);
    }

    const authContext: AuthContext = {
      auth_type: 'api_key',
      subject_type: 'agent',
      subject_id: agent.agent_id,
      team_id: agent.team_id,
      roles: agent.roles,
    };

    request.authContext = authContext;
  };
}
