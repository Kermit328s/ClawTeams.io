// ============================================================
// ClawTeamsClient 单元测试
// ============================================================

import { ClawTeamsClient } from '../src/clawteams-client';
import { HookMessage } from '../src/types';
import { Server as WsServer, WebSocket } from 'ws';

describe('ClawTeamsClient', () => {
  let server: WsServer;
  let serverPort: number;
  let received: string[];

  beforeEach((done) => {
    received = [];
    server = new WsServer({ port: 0 }, () => {
      const addr = server.address();
      serverPort = typeof addr === 'object' ? addr!.port : 0;
      done();
    });

    server.on('connection', (ws) => {
      ws.on('message', (data) => {
        received.push(data.toString());
      });
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  function createClient(): ClawTeamsClient {
    return new ClawTeamsClient({
      serverUrl: `ws://localhost:${serverPort}`,
      clawId: 'test-claw',
    });
  }

  function waitForConnection(client: ClawTeamsClient, timeout = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (client.isConnected()) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error('Connection timeout'));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---- 连接和断开 ----

  test('connect establishes WebSocket connection', async () => {
    const client = createClient();
    client.connect();

    await waitForConnection(client);
    expect(client.isConnected()).toBe(true);

    client.disconnect();
  });

  test('disconnect closes the connection', async () => {
    const client = createClient();
    client.connect();
    await waitForConnection(client);

    client.disconnect();
    await wait(100);

    expect(client.isConnected()).toBe(false);
  });

  test('connect is idempotent when already connected', async () => {
    const client = createClient();
    client.connect();
    await waitForConnection(client);

    // Calling connect again should not create a new connection
    client.connect();
    await wait(100);

    expect(client.isConnected()).toBe(true);
    // Should still only have 1 server connection
    expect(server.clients.size).toBe(1);

    client.disconnect();
  });

  // ---- claw_online 自动发送 ----

  test('sends claw_online on successful connection', async () => {
    const client = createClient();
    client.connect();
    await waitForConnection(client);
    // Give a moment for the message to arrive
    await wait(100);

    expect(received.length).toBeGreaterThanOrEqual(1);
    const msg = JSON.parse(received[0]) as HookMessage;
    expect(msg.type).toBe('claw_online');
    expect((msg.payload as any).claw_id).toBe('test-claw');
    expect((msg.payload as any).timestamp).toBeGreaterThan(0);

    client.disconnect();
  });

  // ---- send 在连接状态下发送成功 ----

  test('send delivers message when connected', async () => {
    const client = createClient();
    client.connect();
    await waitForConnection(client);
    await wait(50); // let claw_online arrive first

    const msg: HookMessage = {
      type: 'agent_execution',
      payload: {
        claw_id: 'test-claw',
        agent_id: 'agent-1',
        run_id: 'run-1',
        status: 'completed',
        has_tool_calls: false,
        timestamp: Date.now(),
      },
    };

    client.send(msg);
    await wait(100);

    // received[0] = claw_online, received[1] = agent_execution
    expect(received.length).toBe(2);
    const parsed = JSON.parse(received[1]) as HookMessage;
    expect(parsed.type).toBe('agent_execution');
    expect((parsed.payload as any).agent_id).toBe('agent-1');

    client.disconnect();
  });

  // ---- send 在断开状态下不报错 ----

  test('send silently drops messages when disconnected', () => {
    const client = createClient();
    // Not connected - send should not throw
    expect(() => {
      client.send({
        type: 'claw_offline',
        payload: { claw_id: 'test-claw', timestamp: Date.now() },
      });
    }).not.toThrow();
  });

  test('send silently drops messages after disconnect', async () => {
    const client = createClient();
    client.connect();
    await waitForConnection(client);

    client.disconnect();
    await wait(100);

    expect(() => {
      client.send({
        type: 'agent_execution',
        payload: {
          claw_id: 'test-claw',
          agent_id: 'a',
          run_id: 'r',
          status: 'completed',
          has_tool_calls: false,
          timestamp: Date.now(),
        },
      });
    }).not.toThrow();
  });

  // ---- isConnected ----

  test('isConnected returns false before connect', () => {
    const client = createClient();
    expect(client.isConnected()).toBe(false);
  });

  // ---- 指数退避重连 ----

  test('reconnects automatically after server disconnect', async () => {
    const client = createClient();
    client.connect();
    await waitForConnection(client);

    // Force disconnect all server-side clients
    server.clients.forEach((ws) => ws.close());
    await wait(200);

    expect(client.isConnected()).toBe(false);

    // Wait for reconnect (base delay = 1s, first reconnect at ~1s)
    await wait(1500);

    expect(client.isConnected()).toBe(true);

    // Should have received a new claw_online from the reconnection
    const onlineMessages = received.filter((r) => {
      const msg = JSON.parse(r);
      return msg.type === 'claw_online';
    });
    expect(onlineMessages.length).toBe(2); // initial + reconnect

    client.disconnect();
  });

  test('does not reconnect after intentional disconnect', async () => {
    const client = createClient();
    client.connect();
    await waitForConnection(client);

    client.disconnect();
    await wait(1500);

    expect(client.isConnected()).toBe(false);
  });

  // ---- 连接到不存在的服务器 ----

  test('handles connection to unreachable server gracefully', () => {
    const client = new ClawTeamsClient({
      serverUrl: 'ws://localhost:19999',
      clawId: 'test-claw',
    });

    // Should not throw
    expect(() => client.connect()).not.toThrow();
    expect(client.isConnected()).toBe(false);

    client.disconnect();
  });
});
