/**
 * 人类账号服务
 * 注册、登录、JWT 会话管理
 */

import type { Pool } from 'pg';
import { signJwt, verifyJwt, type JwtPayload } from '../../infra/gateway/jwt-auth';
import { createHash, randomBytes } from 'crypto';

// ─── 用户类型 ───
export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterUserRequest {
  email: string;
  display_name: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  expires_in: number;
}

export interface UpdateUserRequest {
  display_name?: string;
  avatar_url?: string;
}

// ─── 密码哈希 ───
function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

function encodePasswordHash(salt: string, hash: string): string {
  return `${salt}$${hash}`;
}

function decodePasswordHash(encoded: string): { salt: string; hash: string } {
  const [salt, hash] = encoded.split('$');
  return { salt, hash };
}

// ─── 用户服务 ───
export class UserService {
  constructor(
    private readonly pg: Pool,
    private readonly jwtSecret: string,
    private readonly accessTokenTtl: number = 3600, // 1 hour
    private readonly refreshTokenTtl: number = 604800, // 7 days
  ) {}

  /** 注册新用户 */
  async register(req: RegisterUserRequest): Promise<User> {
    // 检查邮箱是否已存在
    const existing = await this.pg.query('SELECT id FROM users WHERE email = $1', [req.email]);
    if (existing.rows.length > 0) {
      throw new AccountError('EMAIL_EXISTS', 'Email already registered');
    }

    const salt = generateSalt();
    const passwordHash = encodePasswordHash(salt, hashPassword(req.password, salt));

    const result = await this.pg.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, avatar_url, is_active, email_verified, created_at, updated_at`,
      [req.email, req.display_name, passwordHash],
    );

    return this.mapRow(result.rows[0]);
  }

  /** 用户登录 */
  async login(req: LoginRequest): Promise<LoginResponse> {
    const result = await this.pg.query(
      'SELECT id, email, display_name, avatar_url, is_active, email_verified, password_hash, created_at, updated_at FROM users WHERE email = $1',
      [req.email],
    );

    if (result.rows.length === 0) {
      throw new AccountError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const row = result.rows[0];

    if (!row.is_active) {
      throw new AccountError('ACCOUNT_DISABLED', 'Account is disabled');
    }

    // 验证密码
    const { salt, hash } = decodePasswordHash(row.password_hash);
    if (hashPassword(req.password, salt) !== hash) {
      throw new AccountError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const user = this.mapRow(row);

    // 获取用户角色
    const rolesResult = await this.pg.query(
      `SELECT r.name FROM roles r
       JOIN permission_bindings pb ON pb.role_id = r.id
       WHERE pb.subject_type = 'user' AND pb.subject_id = $1::text
       AND (pb.expires_at IS NULL OR pb.expires_at > NOW())`,
      [user.id],
    );
    const roles = rolesResult.rows.map((r: { name: string }) => r.name);

    // 获取用户所属团队
    const teamResult = await this.pg.query(
      `SELECT team_id FROM team_members WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const team_id = teamResult.rows[0]?.team_id;

    // 生成 access token
    const now = Math.floor(Date.now() / 1000);
    const accessToken = signJwt(
      {
        sub: user.id,
        exp: now + this.accessTokenTtl,
        iss: 'clawteams',
        team_id,
        roles,
        email: user.email,
      },
      this.jwtSecret,
    );

    // 生成 refresh token
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.pg.query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, NOW() + make_interval(secs => $3))`,
      [user.id, refreshTokenHash, this.refreshTokenTtl],
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user,
      expires_in: this.accessTokenTtl,
    };
  }

  /** 刷新 access token */
  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const result = await this.pg.query(
      `SELECT us.user_id, u.email, u.is_active
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       WHERE us.refresh_token_hash = $1
       AND us.is_active = TRUE
       AND us.expires_at > NOW()
       AND us.revoked_at IS NULL`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      throw new AccountError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }

    const row = result.rows[0];
    if (!row.is_active) {
      throw new AccountError('ACCOUNT_DISABLED', 'Account is disabled');
    }

    const rolesResult = await this.pg.query(
      `SELECT r.name FROM roles r
       JOIN permission_bindings pb ON pb.role_id = r.id
       WHERE pb.subject_type = 'user' AND pb.subject_id = $1::text
       AND (pb.expires_at IS NULL OR pb.expires_at > NOW())`,
      [row.user_id],
    );
    const roles = rolesResult.rows.map((r: { name: string }) => r.name);

    const teamResult = await this.pg.query(
      `SELECT team_id FROM team_members WHERE user_id = $1 LIMIT 1`,
      [row.user_id],
    );
    const team_id = teamResult.rows[0]?.team_id;

    const now = Math.floor(Date.now() / 1000);
    const accessToken = signJwt(
      {
        sub: row.user_id,
        exp: now + this.accessTokenTtl,
        iss: 'clawteams',
        team_id,
        roles,
        email: row.email,
      },
      this.jwtSecret,
    );

    return { access_token: accessToken, expires_in: this.accessTokenTtl };
  }

  /** 注销（撤销 refresh token） */
  async logout(userId: string): Promise<void> {
    await this.pg.query(
      `UPDATE user_sessions SET is_active = FALSE, revoked_at = NOW()
       WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
    );
  }

  /** 获取用户详情 */
  async getById(userId: string): Promise<User | null> {
    const result = await this.pg.query(
      'SELECT id, email, display_name, avatar_url, is_active, email_verified, created_at, updated_at FROM users WHERE id = $1',
      [userId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /** 更新用户信息 */
  async update(userId: string, req: UpdateUserRequest): Promise<User> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (req.display_name !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(req.display_name);
    }
    if (req.avatar_url !== undefined) {
      fields.push(`avatar_url = $${idx++}`);
      values.push(req.avatar_url);
    }

    if (fields.length === 0) {
      const user = await this.getById(userId);
      if (!user) throw new AccountError('USER_NOT_FOUND', 'User not found');
      return user;
    }

    values.push(userId);
    const result = await this.pg.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, email, display_name, avatar_url, is_active, email_verified, created_at, updated_at`,
      values,
    );

    if (result.rows.length === 0) {
      throw new AccountError('USER_NOT_FOUND', 'User not found');
    }
    return this.mapRow(result.rows[0]);
  }

  /** 禁用用户（软删除） */
  async deactivate(userId: string): Promise<void> {
    await this.pg.query('UPDATE users SET is_active = FALSE WHERE id = $1', [userId]);
    // 撤销所有会话
    await this.logout(userId);
  }

  private mapRow(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      display_name: row.display_name as string,
      avatar_url: row.avatar_url as string | undefined,
      is_active: row.is_active as boolean,
      email_verified: row.email_verified as boolean,
      created_at: (row.created_at as Date).toISOString(),
      updated_at: (row.updated_at as Date).toISOString(),
    };
  }
}

// ─── 账号错误 ───
export class AccountError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
    this.statusCode =
      code === 'EMAIL_EXISTS' ? 409 :
      code === 'INVALID_CREDENTIALS' ? 401 :
      code === 'ACCOUNT_DISABLED' ? 403 :
      code === 'USER_NOT_FOUND' ? 404 :
      code === 'INVALID_REFRESH_TOKEN' ? 401 : 400;
  }
}
