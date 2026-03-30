/**
 * JWT 鉴权中间件
 * 用于人类用户的 Bearer Token 认证
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { createVerify } from 'crypto';
import type { AuthContext } from './server';

// ─── JWT Header ───
interface JwtHeader {
  alg: string;
  typ: string;
}

// ─── JWT Payload ───
export interface JwtPayload {
  /** 主体 ID（用户 ID） */
  sub: string;
  /** 签发时间 */
  iat: number;
  /** 过期时间 */
  exp: number;
  /** 签发者 */
  iss?: string;
  /** 团队 ID */
  team_id?: string;
  /** 角色列表 */
  roles?: string[];
  /** 用户邮箱 */
  email?: string;
}

// ─── Base64URL 解码 ───
function base64UrlDecode(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

// ─── HMAC-SHA256 验签 ───
function verifyHmacSha256(
  headerB64: string,
  payloadB64: string,
  signature: string,
  secret: string,
): boolean {
  const { createHmac } = require('crypto');
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return expectedSig === signature;
}

// ─── 解析和验证 JWT ───
export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtError('INVALID_TOKEN', 'Malformed JWT token');
  }

  const [headerB64, payloadB64, signature] = parts;

  // 解析 header
  let header: JwtHeader;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch {
    throw new JwtError('INVALID_TOKEN', 'Invalid JWT header');
  }

  if (header.alg !== 'HS256') {
    throw new JwtError('UNSUPPORTED_ALG', `Unsupported algorithm: ${header.alg}`);
  }

  // 验证签名
  if (!verifyHmacSha256(headerB64, payloadB64, signature, secret)) {
    throw new JwtError('INVALID_SIGNATURE', 'JWT signature verification failed');
  }

  // 解析 payload
  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    throw new JwtError('INVALID_TOKEN', 'Invalid JWT payload');
  }

  // 检查过期
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new JwtError('TOKEN_EXPIRED', 'JWT token has expired');
  }

  // 检查签发时间（不接受未来签发的 token）
  if (payload.iat && payload.iat > now + 60) {
    throw new JwtError('INVALID_TOKEN', 'JWT token issued in the future');
  }

  return payload;
}

// ─── 生成 JWT ───
export function signJwt(
  payload: Omit<JwtPayload, 'iat'>,
  secret: string,
): string {
  const { createHmac } = require('crypto');

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };

  const fullPayload: JwtPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

// ─── JWT 错误 ───
export class JwtError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'JwtError';
    this.code = code;
    this.statusCode = 401;
  }
}

// ─── Fastify 鉴权 Hook ───
export function jwtAuthHook(secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.status(401).send({
        code: 'MISSING_AUTH',
        message: 'Authorization header is required',
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        code: 'INVALID_AUTH',
        message: 'Authorization header must use Bearer scheme',
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyJwt(token, secret);

      const authContext: AuthContext = {
        auth_type: 'jwt',
        subject_type: 'user',
        subject_id: payload.sub,
        team_id: payload.team_id,
        roles: payload.roles,
      };

      request.authContext = authContext;
    } catch (err) {
      if (err instanceof JwtError) {
        return reply.status(err.statusCode).send({
          code: err.code,
          message: err.message,
        });
      }
      return reply.status(401).send({
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      });
    }
  };
}
