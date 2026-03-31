import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileScanner } from '../../src/tracker/file-scanner';

describe('FileScanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawteams-test-'));
    // 创建模拟 OpenClaw 目录结构
    fs.mkdirSync(path.join(tmpDir, 'workspace', 'agents', 'test-agent'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'agents', 'test-agent', 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'identity'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'memory'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('hashFile', () => {
    it('应计算文件的 SHA-256 hash', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'hello world');

      const scanner = new FileScanner(tmpDir);
      const hash = scanner.hashFile(filePath);

      // SHA-256 of "hello world"
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('相同内容应产生相同 hash', () => {
      const file1 = path.join(tmpDir, 'a.txt');
      const file2 = path.join(tmpDir, 'b.txt');
      fs.writeFileSync(file1, 'same content');
      fs.writeFileSync(file2, 'same content');

      const scanner = new FileScanner(tmpDir);
      expect(scanner.hashFile(file1)).toBe(scanner.hashFile(file2));
    });

    it('不同内容应产生不同 hash', () => {
      const file1 = path.join(tmpDir, 'a.txt');
      const file2 = path.join(tmpDir, 'b.txt');
      fs.writeFileSync(file1, 'content A');
      fs.writeFileSync(file2, 'content B');

      const scanner = new FileScanner(tmpDir);
      expect(scanner.hashFile(file1)).not.toBe(scanner.hashFile(file2));
    });
  });

  describe('getTrackedFiles', () => {
    it('应发现 openclaw.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'openclaw.json'), '{}');

      const scanner = new FileScanner(tmpDir);
      const files = scanner.getTrackedFiles();

      expect(files.some(f => f.relativePath === 'openclaw.json')).toBe(true);
      expect(files.find(f => f.relativePath === 'openclaw.json')?.category).toBe('config');
    });

    it('应发现 device.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'identity', 'device.json'), '{}');

      const scanner = new FileScanner(tmpDir);
      const files = scanner.getTrackedFiles();

      expect(files.some(f => f.relativePath === 'identity/device.json')).toBe(true);
      expect(files.find(f => f.relativePath === 'identity/device.json')?.category).toBe('device');
    });

    it('应发现全局核心 md 文件', () => {
      const coreFiles = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'TOOLS.md', 'USER.md', 'HEARTBEAT.md'];
      for (const file of coreFiles) {
        fs.writeFileSync(path.join(tmpDir, 'workspace', file), `# ${file}`);
      }

      const scanner = new FileScanner(tmpDir);
      const files = scanner.getTrackedFiles();

      for (const file of coreFiles) {
        const tracked = files.find(f => f.relativePath === `workspace/${file}`);
        expect(tracked).toBeDefined();
        expect(tracked?.category).toBe('core');
      }
    });

    it('应发现 Agent 核心 md 文件并关联 agent_id', () => {
      fs.writeFileSync(path.join(tmpDir, 'workspace', 'agents', 'test-agent', 'IDENTITY.md'), '# ID');

      const scanner = new FileScanner(tmpDir);
      const files = scanner.getTrackedFiles();

      const found = files.find(f => f.relativePath === 'workspace/agents/test-agent/IDENTITY.md');
      expect(found).toBeDefined();
      expect(found?.category).toBe('core');
      expect(found?.agentId).toBe('test-agent');
      expect(found?.coreFileType).toBe('identity');
    });

    it('应发现会话 JSONL 文件', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'agents', 'test-agent', 'sessions', 'abc.jsonl'),
        '{"type":"session"}'
      );

      const scanner = new FileScanner(tmpDir);
      const files = scanner.getTrackedFiles();

      const found = files.find(f => f.relativePath === 'agents/test-agent/sessions/abc.jsonl');
      expect(found).toBeDefined();
      expect(found?.category).toBe('session');
      expect(found?.agentId).toBe('test-agent');
    });

    it('应发现 memory SQLite 文件', () => {
      fs.writeFileSync(path.join(tmpDir, 'memory', 'main.sqlite'), 'fake-sqlite');

      const scanner = new FileScanner(tmpDir);
      const files = scanner.getTrackedFiles();

      expect(files.some(f => f.relativePath === 'memory/main.sqlite')).toBe(true);
      expect(files.find(f => f.relativePath === 'memory/main.sqlite')?.category).toBe('memory');
    });

    it('应将非核心 md 文件归类为 work_doc', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'workspace', 'agents', 'test-agent', '工作定义_v1.md'),
        '# 工作定义'
      );

      const scanner = new FileScanner(tmpDir);
      const files = scanner.getTrackedFiles();

      const found = files.find(f => f.relativePath.includes('工作定义'));
      expect(found).toBeDefined();
      expect(found?.category).toBe('work_doc');
    });
  });

  describe('scan', () => {
    it('应返回完整的文件快照', () => {
      fs.writeFileSync(path.join(tmpDir, 'openclaw.json'), '{"gateway":{"port":18789}}');
      fs.writeFileSync(path.join(tmpDir, 'workspace', 'IDENTITY.md'), '# IDENTITY');

      const scanner = new FileScanner(tmpDir);
      const snapshots = scanner.scan();

      expect(snapshots.length).toBeGreaterThanOrEqual(2);

      const config = snapshots.find(s => s.file_path === 'openclaw.json');
      expect(config).toBeDefined();
      expect(config!.hash).toBeTruthy();
      expect(config!.size).toBeGreaterThan(0);
      expect(config!.category).toBe('config');
    });
  });

  describe('against real OpenClaw directory', () => {
    const realDir = path.join(process.env.HOME ?? '', '.openclaw');
    const hasRealDir = fs.existsSync(realDir);

    (hasRealDir ? it : it.skip)('应能扫描真实的 ~/.openclaw/ 目录', () => {
      const scanner = new FileScanner(realDir);
      const files = scanner.getTrackedFiles();

      console.log(`发现 ${files.length} 个追踪文件:`);
      const categories: Record<string, number> = {};
      for (const f of files) {
        categories[f.category] = (categories[f.category] ?? 0) + 1;
      }
      console.log('  分类统计:', categories);

      expect(files.length).toBeGreaterThan(0);

      // 应该有 openclaw.json
      expect(files.some(f => f.relativePath === 'openclaw.json')).toBe(true);
    });

    (hasRealDir ? it : it.skip)('应能完成完整扫描并返回快照', () => {
      const scanner = new FileScanner(realDir);
      const snapshots = scanner.scan();

      console.log(`扫描到 ${snapshots.length} 个文件快照`);

      expect(snapshots.length).toBeGreaterThan(0);
      for (const s of snapshots) {
        expect(s.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(s.size).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
