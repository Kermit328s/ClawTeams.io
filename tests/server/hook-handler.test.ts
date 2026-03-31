import { HookHandler } from '../../src/server/hook-handler';
import { FrontendEvent, HookMessage } from '../../src/server/types';

/**
 * HookHandler 单元测试
 *
 * 使用 mock Database 和 mock broadcast 函数
 */

// Mock Database
function createMockDb() {
  return {
    updateClawStatus: jest.fn(),
    updateAgentStatus: jest.fn(),
    getExecutionByRunId: jest.fn().mockReturnValue(undefined),
    insertExecutionFromHook: jest.fn(),
    upsertAgentRelation: jest.fn(),
  } as any;
}

describe('HookHandler', () => {
  let db: ReturnType<typeof createMockDb>;
  let broadcastedEvents: FrontendEvent[];
  let handler: HookHandler;

  beforeEach(() => {
    db = createMockDb();
    broadcastedEvents = [];
    handler = new HookHandler(db, (event) => broadcastedEvents.push(event));
  });

  describe('claw_online', () => {
    it('should update claw status to online and broadcast', () => {
      const msg: HookMessage = {
        type: 'claw_online',
        payload: { claw_id: 'claw-123', timestamp: Date.now() },
      };

      handler.handle(msg);

      expect(db.updateClawStatus).toHaveBeenCalledWith('claw-123', 'online');
      expect(broadcastedEvents).toHaveLength(1);
      expect(broadcastedEvents[0].type).toBe('claw.status');
      expect((broadcastedEvents[0].payload as any).status).toBe('online');
    });
  });

  describe('claw_offline', () => {
    it('should update claw status to offline and broadcast', () => {
      const msg: HookMessage = {
        type: 'claw_offline',
        payload: { claw_id: 'claw-123', timestamp: Date.now() },
      };

      handler.handle(msg);

      expect(db.updateClawStatus).toHaveBeenCalledWith('claw-123', 'offline');
      expect(broadcastedEvents).toHaveLength(1);
      expect(broadcastedEvents[0].type).toBe('claw.status');
      expect((broadcastedEvents[0].payload as any).status).toBe('offline');
    });
  });

  describe('agent_execution', () => {
    const basePayload = {
      claw_id: 'claw-123',
      agent_id: 'invest',
      run_id: 'run-abc',
      status: 'completed' as const,
      duration_ms: 5000,
      token_usage: { input: 100, output: 200, total: 300 },
      has_tool_calls: true,
      timestamp: Date.now(),
    };

    it('should insert execution and broadcast execution.new + agent.status', () => {
      const msg: HookMessage = { type: 'agent_execution', payload: basePayload };

      handler.handle(msg);

      expect(db.getExecutionByRunId).toHaveBeenCalledWith('run-abc');
      expect(db.insertExecutionFromHook).toHaveBeenCalledTimes(1);
      expect(db.updateAgentStatus).toHaveBeenCalledWith('claw-123', 'invest', 'idle');

      // 应该有两个广播事件：execution.new 和 agent.status
      expect(broadcastedEvents).toHaveLength(2);
      expect(broadcastedEvents[0].type).toBe('execution.new');
      expect(broadcastedEvents[1].type).toBe('agent.status');
    });

    it('should skip duplicate execution by run_id', () => {
      db.getExecutionByRunId.mockReturnValue({ id: 1 });

      const msg: HookMessage = { type: 'agent_execution', payload: basePayload };
      handler.handle(msg);

      expect(db.insertExecutionFromHook).not.toHaveBeenCalled();
      expect(broadcastedEvents).toHaveLength(0);
    });

    it('should set agent status to failed on failed execution', () => {
      const msg: HookMessage = {
        type: 'agent_execution',
        payload: { ...basePayload, status: 'failed' },
      };

      handler.handle(msg);

      expect(db.updateAgentStatus).toHaveBeenCalledWith('claw-123', 'invest', 'failed');
    });
  });

  describe('subagent_spawned', () => {
    it('should upsert agent relation and broadcast', () => {
      const msg: HookMessage = {
        type: 'subagent_spawned',
        payload: {
          claw_id: 'claw-123',
          parent_key: 'invest',
          child_key: 'sub-analysis',
          task: 'Analyze market data',
          timestamp: Date.now(),
        },
      };

      handler.handle(msg);

      expect(db.upsertAgentRelation).toHaveBeenCalledWith({
        source_agent_id: 'invest',
        target_agent_id: 'sub-analysis',
        relation_type: 'subagent',
        source_info: 'task: Analyze market data',
      });
      expect(db.updateAgentStatus).toHaveBeenCalledWith('claw-123', 'sub-analysis', 'running');
      expect(broadcastedEvents).toHaveLength(1);
      expect(broadcastedEvents[0].type).toBe('subagent.spawned');
    });
  });

  describe('subagent_ended', () => {
    it('should update agent status and broadcast', () => {
      const msg: HookMessage = {
        type: 'subagent_ended',
        payload: {
          claw_id: 'claw-123',
          child_key: 'sub-analysis',
          outcome: 'success',
          timestamp: Date.now(),
        },
      };

      handler.handle(msg);

      expect(db.updateAgentStatus).toHaveBeenCalledWith('claw-123', 'sub-analysis', 'idle');
      expect(broadcastedEvents).toHaveLength(1);
      expect(broadcastedEvents[0].type).toBe('subagent.ended');
      expect((broadcastedEvents[0].payload as any).outcome).toBe('success');
    });
  });
});
