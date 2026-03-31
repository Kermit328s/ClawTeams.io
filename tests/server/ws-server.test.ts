import WebSocket from 'ws';
import { WsServer } from '../../src/server/ws-server';
import { HookMessage, FrontendEvent } from '../../src/server/types';

/**
 * WsServer 集成测试
 *
 * 使用 mock Database，真实 WebSocket 连接
 */

function createMockDb() {
  return {
    updateClawStatus: jest.fn(),
    updateAgentStatus: jest.fn(),
    getExecutionByRunId: jest.fn().mockReturnValue(undefined),
    insertExecutionFromHook: jest.fn(),
    upsertAgentRelation: jest.fn(),
  } as any;
}

const TEST_PORT = 13001; // 用测试端口避免冲突

function connectWs(path: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}${path}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe('WsServer', () => {
  let server: WsServer;
  let db: ReturnType<typeof createMockDb>;
  let hookEvents: HookMessage[];

  beforeAll((done) => {
    db = createMockDb();
    hookEvents = [];
    server = new WsServer({
      port: TEST_PORT,
      db,
      onHookEvent: (msg) => hookEvents.push(msg),
    });
    server.start();
    // 给 HTTP server 时间启动
    setTimeout(done, 200);
  });

  afterAll(() => {
    server.stop();
  });

  beforeEach(() => {
    hookEvents = [];
    db.updateClawStatus.mockClear();
    db.updateAgentStatus.mockClear();
    db.getExecutionByRunId.mockClear();
    db.insertExecutionFromHook.mockClear();
    db.upsertAgentRelation.mockClear();
  });

  describe('connection', () => {
    it('should accept hook connections on /ws/hook', async () => {
      const ws = await connectWs('/ws/hook');
      expect(ws.readyState).toBe(WebSocket.OPEN);

      const stats = server.getStats();
      expect(stats.hookConnections).toBeGreaterThanOrEqual(1);

      ws.close();
    });

    it('should accept frontend connections on /ws/frontend', async () => {
      const ws = await connectWs('/ws/frontend');
      expect(ws.readyState).toBe(WebSocket.OPEN);

      const stats = server.getStats();
      expect(stats.frontendConnections).toBeGreaterThanOrEqual(1);

      ws.close();
      // 等待关闭事件传播
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  describe('hook message handling', () => {
    it('should process valid claw_online message', async () => {
      const hookWs = await connectWs('/ws/hook');
      const frontendWs = await connectWs('/ws/frontend');

      const messagePromise = waitForMessage(frontendWs);

      const msg: HookMessage = {
        type: 'claw_online',
        payload: { claw_id: 'test-claw', timestamp: Date.now() },
      };
      hookWs.send(JSON.stringify(msg));

      const received = (await messagePromise) as FrontendEvent;
      expect(received.type).toBe('claw.status');
      expect((received.payload as any).status).toBe('online');

      expect(db.updateClawStatus).toHaveBeenCalledWith('test-claw', 'online');
      expect(hookEvents).toHaveLength(1);
      expect(hookEvents[0].type).toBe('claw_online');

      hookWs.close();
      frontendWs.close();
      await new Promise((r) => setTimeout(r, 50));
    });

    it('should return error for invalid JSON', async () => {
      const hookWs = await connectWs('/ws/hook');
      const errorPromise = waitForMessage(hookWs);

      hookWs.send('not-json');

      const received = (await errorPromise) as { error: { code: string } };
      expect(received.error.code).toBe('INVALID_JSON');

      hookWs.close();
      await new Promise((r) => setTimeout(r, 50));
    });

    it('should return error for invalid message format', async () => {
      const hookWs = await connectWs('/ws/hook');
      const errorPromise = waitForMessage(hookWs);

      hookWs.send(JSON.stringify({ foo: 'bar' }));

      const received = (await errorPromise) as { error: { code: string } };
      expect(received.error.code).toBe('INVALID_FORMAT');

      hookWs.close();
      await new Promise((r) => setTimeout(r, 50));
    });

    it('should return error for unknown hook type', async () => {
      const hookWs = await connectWs('/ws/hook');
      const errorPromise = waitForMessage(hookWs);

      hookWs.send(JSON.stringify({ type: 'unknown_type', payload: {} }));

      const received = (await errorPromise) as { error: { code: string } };
      expect(received.error.code).toBe('INVALID_FORMAT');

      hookWs.close();
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  describe('frontend broadcast', () => {
    it('should broadcast to multiple frontend connections', async () => {
      const frontend1 = await connectWs('/ws/frontend');
      const frontend2 = await connectWs('/ws/frontend');

      const p1 = waitForMessage(frontend1);
      const p2 = waitForMessage(frontend2);

      const event: FrontendEvent = {
        type: 'file.changed',
        payload: { file_path: 'test.md', change_type: 'modified' },
        timestamp: Date.now(),
      };
      server.broadcastToFrontend(event);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect((r1 as FrontendEvent).type).toBe('file.changed');
      expect((r2 as FrontendEvent).type).toBe('file.changed');

      frontend1.close();
      frontend2.close();
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  describe('end-to-end hook → frontend flow', () => {
    it('should relay agent_execution from hook to frontend', async () => {
      const hookWs = await connectWs('/ws/hook');
      const frontendWs = await connectWs('/ws/frontend');

      // agent_execution 会产生两个前端事件：execution.new 和 agent.status
      const messages: unknown[] = [];
      frontendWs.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      const msg: HookMessage = {
        type: 'agent_execution',
        payload: {
          claw_id: 'claw-1',
          agent_id: 'invest',
          run_id: 'run-e2e',
          status: 'completed',
          duration_ms: 3000,
          token_usage: { input: 50, output: 100, total: 150 },
          has_tool_calls: true,
          timestamp: Date.now(),
        },
      };

      hookWs.send(JSON.stringify(msg));

      // 等待消息传播
      await new Promise((r) => setTimeout(r, 100));

      expect(messages.length).toBe(2);
      expect((messages[0] as FrontendEvent).type).toBe('execution.new');
      expect((messages[1] as FrontendEvent).type).toBe('agent.status');

      expect(db.insertExecutionFromHook).toHaveBeenCalledTimes(1);
      expect(db.updateAgentStatus).toHaveBeenCalledWith('claw-1', 'invest', 'idle');

      hookWs.close();
      frontendWs.close();
      await new Promise((r) => setTimeout(r, 50));
    });
  });
});
