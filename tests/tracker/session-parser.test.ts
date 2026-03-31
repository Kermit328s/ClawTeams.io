import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionParser } from '../../src/tracker/session-parser';

describe('SessionParser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawteams-session-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readNewLines', () => {
    it('应首次读取时返回所有行', () => {
      const filePath = path.join(tmpDir, 'test.jsonl');
      fs.writeFileSync(
        filePath,
        [
          '{"type":"session","version":3,"id":"abc","timestamp":"2026-03-30T00:00:00Z"}',
          '{"type":"message","id":"1","timestamp":"2026-03-30T00:01:00Z","message":{"role":"user","content":"hello"}}',
          '{"type":"message","id":"2","timestamp":"2026-03-30T00:02:00Z","message":{"role":"assistant","content":"hi there"}}',
        ].join('\n')
      );

      const parser = new SessionParser();
      const entries = parser.readNewLines(filePath);

      expect(entries.length).toBe(3);
      expect(entries[0].type).toBe('session');
      expect(entries[1].type).toBe('message');
    });

    it('应增量读取新行', () => {
      const filePath = path.join(tmpDir, 'test.jsonl');
      fs.writeFileSync(
        filePath,
        '{"type":"session","version":3,"id":"abc","timestamp":"2026-03-30T00:00:00Z"}\n' +
        '{"type":"message","id":"1","timestamp":"2026-03-30T00:01:00Z","message":{"role":"user","content":"hello"}}\n'
      );

      const parser = new SessionParser();

      // 第一次读取
      const first = parser.readNewLines(filePath);
      expect(first.length).toBe(2);

      // 追加新行
      fs.appendFileSync(
        filePath,
        '{"type":"message","id":"2","timestamp":"2026-03-30T00:02:00Z","message":{"role":"assistant","content":"response"}}\n'
      );

      // 第二次读取：只返回新行
      const second = parser.readNewLines(filePath);
      expect(second.length).toBe(1);
      expect(second[0].type).toBe('message');
    });

    it('应跳过无效的 JSON 行', () => {
      const filePath = path.join(tmpDir, 'test.jsonl');
      fs.writeFileSync(
        filePath,
        '{"type":"session","id":"abc","timestamp":"2026-03-30T00:00:00Z"}\n' +
        'this is not json\n' +
        '{"type":"message","id":"1","timestamp":"2026-03-30T00:01:00Z","message":{"role":"user","content":"ok"}}\n'
      );

      const parser = new SessionParser();
      const entries = parser.readNewLines(filePath);

      expect(entries.length).toBe(2); // 跳过了无效行
    });

    it('应处理不存在的文件', () => {
      const parser = new SessionParser();
      const entries = parser.readNewLines('/nonexistent/file.jsonl');
      expect(entries.length).toBe(0);
    });
  });

  describe('getLastLineRead / setLastLineRead', () => {
    it('应正确记录和恢复读取位置', () => {
      const parser = new SessionParser();
      const filePath = '/some/file.jsonl';

      expect(parser.getLastLineRead(filePath)).toBe(0);

      parser.setLastLineRead(filePath, 42);
      expect(parser.getLastLineRead(filePath)).toBe(42);
    });
  });

  describe('extractTasks', () => {
    it('应从 user+assistant 消息对中提取任务', () => {
      const parser = new SessionParser();
      const entries = [
        {
          type: 'session' as const,
          version: 3,
          id: 'sess-123',
          timestamp: '2026-03-30T09:00:00Z',
        },
        {
          type: 'message' as const,
          id: '1',
          timestamp: '2026-03-30T09:00:01Z',
          message: { role: 'user' as const, content: '请分析比特币市场趋势' },
        },
        {
          type: 'message' as const,
          id: '2',
          timestamp: '2026-03-30T09:05:00Z',
          message: {
            role: 'assistant' as const,
            content: '根据分析，比特币目前处于横盘震荡期...',
          },
        },
      ];

      const tasks = parser.extractTasks(entries, 'butterfly-invest');

      expect(tasks.length).toBe(1);
      expect(tasks[0].session_id).toBe('sess-123');
      expect(tasks[0].agent_id).toBe('butterfly-invest');
      expect(tasks[0].status).toBe('completed');
      expect(tasks[0].input_preview).toContain('比特币');
      expect(tasks[0].output_preview).toContain('横盘震荡');
      expect(tasks[0].duration_ms).toBeGreaterThan(0);
    });

    it('应处理带 content 数组的消息', () => {
      const parser = new SessionParser();
      const entries = [
        {
          type: 'session' as const,
          version: 3,
          id: 'sess-456',
          timestamp: '2026-03-30T10:00:00Z',
        },
        {
          type: 'message' as const,
          id: '1',
          timestamp: '2026-03-30T10:00:01Z',
          message: {
            role: 'user' as const,
            content: [{ type: 'text', text: 'Sender info...\n\n检查信号' }],
          },
        },
        {
          type: 'message' as const,
          id: '2',
          timestamp: '2026-03-30T10:01:00Z',
          message: {
            role: 'assistant' as const,
            content: [{ type: 'text', text: '已完成信号检查' }],
          },
        },
      ];

      const tasks = parser.extractTasks(entries, 'trigger');

      expect(tasks.length).toBe(1);
      expect(tasks[0].input_preview).toContain('信号');
      expect(tasks[0].trigger).toBe('user'); // 包含 Sender 关键词
    });

    it('应处理多轮对话', () => {
      const parser = new SessionParser();
      const entries = [
        { type: 'session' as const, version: 3, id: 'sess-789', timestamp: '2026-03-30T11:00:00Z' },
        { type: 'message' as const, id: '1', timestamp: '2026-03-30T11:00:01Z', message: { role: 'user' as const, content: '第一个问题' } },
        { type: 'message' as const, id: '2', timestamp: '2026-03-30T11:01:00Z', message: { role: 'assistant' as const, content: '第一个回答' } },
        { type: 'message' as const, id: '3', timestamp: '2026-03-30T11:02:00Z', message: { role: 'user' as const, content: '第二个问题' } },
        { type: 'message' as const, id: '4', timestamp: '2026-03-30T11:03:00Z', message: { role: 'assistant' as const, content: '第二个回答' } },
      ];

      const tasks = parser.extractTasks(entries, 'test');
      expect(tasks.length).toBe(2);
    });

    it('应跳过非 message 类型的条目', () => {
      const parser = new SessionParser();
      const entries = [
        { type: 'session' as const, version: 3, id: 'sess-000', timestamp: '2026-03-30T12:00:00Z' },
        { type: 'model_change' as const, id: 'mc1', parentId: null, timestamp: '2026-03-30T12:00:01Z', provider: 'openai', modelId: 'gpt-5.4' },
        { type: 'message' as const, id: '1', timestamp: '2026-03-30T12:00:02Z', message: { role: 'user' as const, content: 'test' } },
        { type: 'thinking_level_change' as const, id: 'tc1', parentId: null, timestamp: '2026-03-30T12:00:03Z', thinkingLevel: 'off' },
        { type: 'message' as const, id: '2', timestamp: '2026-03-30T12:00:04Z', message: { role: 'assistant' as const, content: 'done' } },
      ];

      const tasks = parser.extractTasks(entries, 'test');
      expect(tasks.length).toBe(1);
    });
  });

  describe('against real session files', () => {
    const realDir = path.join(process.env.HOME ?? '', '.openclaw');
    const hasRealDir = fs.existsSync(realDir);

    (hasRealDir ? it : it.skip)('应能增量解析真实的 JSONL 文件', () => {
      const sessionsDir = path.join(realDir, 'agents', 'main', 'sessions');
      if (!fs.existsSync(sessionsDir)) return;

      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      if (files.length === 0) return;

      const parser = new SessionParser();
      const filePath = path.join(sessionsDir, files[0]);
      const entries = parser.readNewLines(filePath);

      console.log(`解析 ${filePath}:`);
      console.log(`  总条目数: ${entries.length}`);
      console.log(`  类型分布:`, entries.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>));

      const tasks = parser.extractTasks(entries, 'main');
      console.log(`  提取任务数: ${tasks.length}`);

      expect(entries.length).toBeGreaterThan(0);

      // 再次读取应返回空
      const second = parser.readNewLines(filePath);
      expect(second.length).toBe(0);
    });
  });
});
