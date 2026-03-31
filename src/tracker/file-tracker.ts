import * as fs from 'fs';
import * as path from 'path';
import { FileScanner } from './file-scanner';
import { SessionParser } from './session-parser';
import { MdParser } from './md-parser';
import { FileSnapshot, FileChange, ChangeType } from './types';
import { Database } from '../store/database';

const DEFAULT_SCAN_INTERVAL_MS = 10_000;
const LARGE_FILE_THRESHOLD = 100 * 1024; // 100KB

/**
 * 文件追踪服务主体：定时扫描，对比变更
 */
export class FileTracker {
  private readonly openclawDir: string;
  private readonly db: Database;
  private readonly scanIntervalMs: number;
  private readonly scanner: FileScanner;
  private readonly sessionParser: SessionParser;
  private readonly mdParser: MdParser;

  private timer: ReturnType<typeof setInterval> | null = null;
  private previousSnapshots: Map<string, FileSnapshot> = new Map();
  private changeCallbacks: Array<(changes: FileChange[]) => void> = [];
  private running = false;

  constructor(openclawDir: string, db: Database, scanIntervalMs?: number) {
    this.openclawDir = path.resolve(openclawDir);
    this.db = db;
    this.scanIntervalMs = scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
    this.scanner = new FileScanner(openclawDir);
    this.sessionParser = new SessionParser();
    this.mdParser = new MdParser();
  }

  /**
   * 启动追踪（定时扫描循环）
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // 恢复扫描状态
    this.restoreScanState();

    // 执行初始扫描
    console.log(`[FileTracker] 启动追踪 — 目录: ${this.openclawDir}`);
    console.log(`[FileTracker] 扫描间隔: ${this.scanIntervalMs}ms`);

    const initialChanges = this.runOnce();
    console.log(`[FileTracker] 初始扫描完成 — 追踪 ${this.previousSnapshots.size} 个文件`);
    if (initialChanges.length > 0) {
      this.notifyChanges(initialChanges);
    }

    // 定时扫描
    this.timer = setInterval(() => {
      try {
        const changes = this.runOnce();
        if (changes.length > 0) {
          this.notifyChanges(changes);
        }
      } catch (err) {
        console.error('[FileTracker] 扫描出错:', err);
      }
    }, this.scanIntervalMs);
  }

  /**
   * 停止追踪
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[FileTracker] 已停止追踪');
  }

  /**
   * 执行一次扫描对比
   */
  runOnce(): FileChange[] {
    const currentSnapshots = this.scanner.scan();
    const changes: FileChange[] = [];
    const currentMap = new Map<string, FileSnapshot>();
    const now = new Date();

    for (const snapshot of currentSnapshots) {
      currentMap.set(snapshot.file_path, snapshot);
    }

    // 检测新增和修改
    for (const [filePath, current] of currentMap) {
      const previous = this.previousSnapshots.get(filePath);

      if (!previous) {
        // 新增文件
        const change = this.buildChange(current, 'added', undefined, now);
        changes.push(change);
        this.persistFileVersion(current, change);
      } else if (previous.hash !== current.hash) {
        // 文件修改
        const change = this.buildChange(current, 'modified', previous, now);
        changes.push(change);
        this.persistFileVersion(current, change);
      }
    }

    // 检测删除
    for (const [filePath, previous] of this.previousSnapshots) {
      if (!currentMap.has(filePath)) {
        changes.push({
          file_path: filePath,
          absolute_path: previous.absolute_path,
          category: previous.category,
          change_type: 'deleted',
          old_hash: previous.hash,
          old_size: previous.size,
          agent_id: previous.agent_id,
          core_file_type: previous.core_file_type,
          detected_at: now,
        });
      }
    }

    // 更新快照
    this.previousSnapshots = currentMap;

    // 保存扫描状态到数据库
    this.saveScanState();

    return changes;
  }

  /**
   * 注册变更回调
   */
  onChange(callback: (changes: FileChange[]) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * 构建变更记录
   */
  private buildChange(
    snapshot: FileSnapshot,
    changeType: ChangeType,
    previous: FileSnapshot | undefined,
    detectedAt: Date
  ): FileChange {
    const change: FileChange = {
      file_path: snapshot.file_path,
      absolute_path: snapshot.absolute_path,
      category: snapshot.category,
      change_type: changeType,
      new_hash: snapshot.hash,
      new_size: snapshot.size,
      old_hash: previous?.hash,
      old_size: previous?.size,
      agent_id: snapshot.agent_id,
      core_file_type: snapshot.core_file_type,
      detected_at: detectedAt,
    };

    // 大文件只存 hash 不存内容
    if (snapshot.size > LARGE_FILE_THRESHOLD) {
      return change;
    }

    try {
      if (snapshot.category === 'session') {
        // 会话文件只存增量
        const newEntries = this.sessionParser.readNewLines(snapshot.absolute_path);
        if (newEntries.length > 0) {
          change.content = newEntries.map(e => JSON.stringify(e)).join('\n');

          // 提取任务事件并存储
          const tasks = this.sessionParser.extractTasks(newEntries, snapshot.agent_id ?? '');
          for (const task of tasks) {
            this.db.insertExecution(task);
          }
        }
      } else if (snapshot.category === 'memory') {
        // SQLite 数据库 — 只记录 hash 变化，不读内容
      } else {
        // 核心文件和工作空间文件：读取完整内容
        const content = fs.readFileSync(snapshot.absolute_path, 'utf-8');
        change.content = content;

        // 如果有旧内容，生成简单 diff
        if (previous && changeType === 'modified') {
          change.diff = this.simpleDiff(
            this.db.getLatestFileContent(snapshot.file_path) ?? '',
            content
          );
        }
      }
    } catch {
      // 无法读取文件内容
    }

    return change;
  }

  /**
   * 持久化文件版本
   */
  private persistFileVersion(snapshot: FileSnapshot, change: FileChange): void {
    try {
      // 更新 core_files 表
      this.db.upsertCoreFile({
        claw_id: '', // TODO: 从 device.json 获取
        agent_id: snapshot.agent_id ?? null,
        file_type: snapshot.core_file_type ?? null,
        file_path: snapshot.file_path,
        current_hash: snapshot.hash,
        current_content: change.content ?? null,
      });

      // 插入文件版本
      if (change.content || change.new_hash) {
        this.db.insertFileVersion({
          file_path: snapshot.file_path,
          hash: snapshot.hash,
          content: change.content ?? null,
          diff_from_prev: change.diff ?? null,
        });
      }
    } catch (err) {
      console.error(`[FileTracker] 持久化失败 ${snapshot.file_path}:`, err);
    }
  }

  /**
   * 恢复扫描状态
   */
  private restoreScanState(): void {
    try {
      const states = this.db.getAllScanStates();
      for (const state of states) {
        if (state.last_hash) {
          this.previousSnapshots.set(state.file_path, {
            file_path: state.file_path,
            absolute_path: path.join(this.openclawDir, state.file_path),
            category: 'core', // 简化：真实类别会在下次扫描时更正
            hash: state.last_hash,
            size: 0,
            mtime: new Date(state.last_scan_at),
          });
        }
        // 恢复 JSONL 读取位置
        if (state.jsonl_last_line != null && state.file_path.endsWith('.jsonl')) {
          this.sessionParser.setLastLineRead(
            path.join(this.openclawDir, state.file_path),
            state.jsonl_last_line
          );
        }
      }
    } catch {
      // 首次运行，无历史状态
    }
  }

  /**
   * 保存扫描状态
   */
  private saveScanState(): void {
    try {
      for (const [filePath, snapshot] of this.previousSnapshots) {
        const jsonlLastLine = filePath.endsWith('.jsonl')
          ? this.sessionParser.getLastLineRead(path.join(this.openclawDir, filePath))
          : null;

        this.db.upsertScanState({
          file_path: filePath,
          last_hash: snapshot.hash,
          last_scan_at: new Date().toISOString(),
          jsonl_last_line: jsonlLastLine,
        });
      }
    } catch (err) {
      console.error('[FileTracker] 保存扫描状态失败:', err);
    }
  }

  /**
   * 简单 diff：逐行对比，输出变更行
   */
  private simpleDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: string[] = [];

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] ?? '';
      const newLine = newLines[i] ?? '';
      if (oldLine !== newLine) {
        if (oldLine) diff.push(`- ${oldLine}`);
        if (newLine) diff.push(`+ ${newLine}`);
      }
    }

    return diff.join('\n');
  }

  /**
   * 通知所有回调
   */
  private notifyChanges(changes: FileChange[]): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(changes);
      } catch (err) {
        console.error('[FileTracker] 回调执行出错:', err);
      }
    }
  }
}
