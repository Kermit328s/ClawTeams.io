// ============================================================
// 认证路由 — 简化版（阶段一单人场景）
// ============================================================

import { FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import { Database } from '../../store/database';

export function registerAuthRoutes(app: FastifyInstance, db: Database): void {
  // 注册
  app.post('/api/v1/auth/register', async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name: string;
    };

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required' });
    }

    // 检查是否已存在
    const existing = db.getUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'email already registered' });
    }

    // 简单 hash（阶段一不做真正的 bcrypt）
    const password_hash = crypto.createHash('sha256').update(password).digest('hex');
    const token = crypto.randomUUID();

    const { id } = db.createUser({ email, password_hash, name: name ?? '' });

    // 存储 token
    db.rawRun('UPDATE users SET token = ? WHERE id = ?', token, id);

    return { user_id: id, token };
  });

  // 登录
  app.post('/api/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required' });
    }

    const user = db.getUserByEmail(email) as {
      id: number;
      email: string;
      password_hash: string;
      name: string;
      token: string;
    } | undefined;

    if (!user) {
      return reply.status(401).send({ error: 'invalid credentials' });
    }

    const password_hash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password_hash !== password_hash) {
      return reply.status(401).send({ error: 'invalid credentials' });
    }

    // 生成新 token
    const token = crypto.randomUUID();
    db.rawRun('UPDATE users SET token = ? WHERE id = ?', token, user.id);

    return { user_id: user.id, token };
  });
}
