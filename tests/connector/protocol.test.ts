/**
 * 通信协议单元测试
 * 测试 ConnectionManager 的注册、心跳、连接管理逻辑
 */


import { EventEmitter } from 'events';
import { ConnectionManager } from '../../src/connector/protocol/connection-manager';
import { createFrame, serializeFrame } from '../../src/connector/utils';
import type {
  AgentRegisterPayload,
  AgentHeartbeatPayload,
  AgentRegisterAckPayload,
} from '../../src/connector/types';

/** 模拟 WebSocket 对象 */
function createMockWs() {
  const sent: string[] = [];
  return {
    readyState: 1, // OPEN
    send: jest.fn((data: string) => sent.push(data)),
    close: jest.fn(),
    _sent: sent,
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  } as any;
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  describe('handleRegister', () => {
    it('should register agent and send ack (no auth)', async () => {
      const ws = createMockWs();
      const frame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [{ name: 'code_review', version: '1.0' }],
        runtime: { platform: 'linux-x64' },
      });

      await manager.handleRegister(ws, frame);

      expect(ws.send).toHaveBeenCalledTimes(1);
      const ack = JSON.parse(ws._sent[0]);
      expect(ack.msg_type).toBe('agent.register_ack');
      expect(ack.payload.success).toBe(true);
      expect(ack.payload.session_id).toBeDefined();
      expect(ack.reply_to).toBe(frame.msg_id);
    });

    it('should track agent connection', async () => {
      const ws = createMockWs();
      const frame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [],
        runtime: {},
      });

      await manager.handleRegister(ws, frame);

      expect(manager.isOnline('agent-1')).toBe(true);
      expect(manager.getOnlineAgentIds()).toContain('agent-1');
    });

    it('should emit agent_connected event', async () => {
      const events: any[] = [];
      manager.on('agent_connected', (e) => events.push(e));

      const ws = createMockWs();
      const frame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [{ name: 'test', version: '1.0' }],
        runtime: {},
      });

      await manager.handleRegister(ws, frame);

      expect(events).toHaveLength(1);
      expect(events[0].agent_id).toBe('agent-1');
    });

    it('should reject with auth failure when authenticator denies', async () => {
      const authedManager = new ConnectionManager({
        authenticator: async () => ({
          valid: false,
          error: 'Invalid API key',
        }),
      });

      const ws = createMockWs();
      const frame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'bad-key',
        capabilities: [],
        runtime: {},
      });

      await authedManager.handleRegister(ws, frame);

      const ack = JSON.parse(ws._sent[0]);
      expect(ack.payload.success).toBe(false);
      expect(ack.payload.error).toBe('Invalid API key');
      expect(authedManager.isOnline('agent-1')).toBe(false);
    });

    it('should replace existing connection on re-register', async () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      const frame1 = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [],
        runtime: {},
      });

      await manager.handleRegister(ws1, frame1);
      await manager.handleRegister(ws2, frame1);

      expect(ws1.close).toHaveBeenCalled();
    });
  });

  describe('handleHeartbeat', () => {
    it('should update connection state and send ack', async () => {
      const ws = createMockWs();
      const regFrame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [],
        runtime: {},
      });

      await manager.handleRegister(ws, regFrame);
      const regAck = JSON.parse(ws._sent[0]);
      const sessionId = regAck.payload.session_id;

      const hbFrame = createFrame<AgentHeartbeatPayload>('agent.heartbeat', {
        agent_id: 'agent-1',
        session_id: sessionId,
        status: 'busy',
        current_task_id: 'task-1',
      });

      manager.handleHeartbeat(ws, hbFrame);

      expect(ws.send).toHaveBeenCalledTimes(2); // register ack + heartbeat ack
      const hbAck = JSON.parse(ws._sent[1]);
      expect(hbAck.msg_type).toBe('agent.heartbeat_ack');
      expect(hbAck.payload.received).toBe(true);

      const conn = manager.getConnection('agent-1');
      expect(conn?.heartbeat_status).toBe('busy');
      expect(conn?.current_task_id).toBe('task-1');
    });

    it('should reject heartbeat with expired session', async () => {
      const ws = createMockWs();

      const hbFrame = createFrame<AgentHeartbeatPayload>('agent.heartbeat', {
        agent_id: 'agent-1',
        session_id: 'invalid-session',
        status: 'idle',
      });

      manager.handleHeartbeat(ws, hbFrame);

      const errorMsg = JSON.parse(ws._sent[0]);
      expect(errorMsg.msg_type).toBe('error');
      expect(errorMsg.payload.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('handleDisconnect', () => {
    it('should remove agent and emit event', async () => {
      const events: any[] = [];
      manager.on('agent_disconnected', (e) => events.push(e));

      const ws = createMockWs();
      const frame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [],
        runtime: {},
      });

      await manager.handleRegister(ws, frame);
      manager.handleDisconnect('agent-1');

      expect(manager.isOnline('agent-1')).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0].agent_id).toBe('agent-1');
    });
  });

  describe('sendToAgent', () => {
    it('should send message to registered agent', async () => {
      const ws = createMockWs();
      const frame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [],
        runtime: {},
      });

      await manager.handleRegister(ws, frame);

      const taskFrame = createFrame('task.assign', { task_id: 'task-1' });
      const result = manager.sendToAgent('agent-1', taskFrame);

      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledTimes(2); // register ack + task assign
    });

    it('should return false for offline agent', () => {
      const taskFrame = createFrame('task.assign', { task_id: 'task-1' });
      const result = manager.sendToAgent('nonexistent', taskFrame);
      expect(result).toBe(false);
    });
  });

  describe('subscriptions', () => {
    it('should track subscribed patterns', async () => {
      const ws = createMockWs();
      const frame = createFrame<AgentRegisterPayload>('agent.register', {
        agent_id: 'agent-1',
        api_key: 'key-1',
        capabilities: [],
        runtime: {},
      });

      await manager.handleRegister(ws, frame);
      manager.updateSubscriptions('agent-1', ['task.*', 'workflow.completed']);

      const conn = manager.getConnection('agent-1');
      expect(conn?.subscribed_patterns).toEqual(['task.*', 'workflow.completed']);
    });
  });
});
