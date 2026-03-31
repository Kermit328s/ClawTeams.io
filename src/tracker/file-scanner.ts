import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { FileSnapshot, TrackedFileCategory, CoreFileType } from './types';

/**
 * 文件扫描器：遍历 OpenClaw 目录，计算 hash，返回文件快照
 */
export class FileScanner {
  private readonly openclawDir: string;

  constructor(openclawDir: string) {
    this.openclawDir = path.resolve(openclawDir);
  }

  /**
   * 扫描所有追踪文件，返回快照列表
   */
  scan(): FileSnapshot[] {
    const trackedFiles = this.getTrackedFiles();
    const snapshots: FileSnapshot[] = [];

    for (const info of trackedFiles) {
      try {
        const stat = fs.statSync(info.absolutePath);
        const hash = this.hashFile(info.absolutePath);
        snapshots.push({
          file_path: info.relativePath,
          absolute_path: info.absolutePath,
          category: info.category,
          hash,
          size: stat.size,
          mtime: stat.mtime,
          agent_id: info.agentId,
          core_file_type: info.coreFileType,
        });
      } catch {
        // 文件可能在扫描过程中被删除，跳过
      }
    }

    return snapshots;
  }

  /**
   * 计算单个文件的 SHA-256 hash
   */
  hashFile(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 获取追踪文件列表（核心文件 + 会话文件 + 工作空间文件）
   */
  getTrackedFiles(): TrackedFileInfo[] {
    const files: TrackedFileInfo[] = [];

    // 1. openclaw.json — 系统配置
    this.addFileIfExists(files, 'openclaw.json', 'config');

    // 2. identity/device.json — 设备身份
    this.addFileIfExists(files, 'identity/device.json', 'device');

    // 3. workspace/*.md — 全局核心文件
    this.addGlobalCoreFiles(files);

    // 4. workspace/agents/*/*.md — 各 Agent 核心文件
    this.addAgentCoreFiles(files);

    // 5. agents/*/sessions/*.jsonl — 会话文件
    this.addSessionFiles(files);

    // 6. memory/*.sqlite — 记忆数据库
    this.addMemoryFiles(files);

    return files;
  }

  private addFileIfExists(
    files: TrackedFileInfo[],
    relativePath: string,
    category: TrackedFileCategory,
    agentId?: string,
    coreFileType?: CoreFileType
  ): void {
    const absolutePath = path.join(this.openclawDir, relativePath);
    if (fs.existsSync(absolutePath)) {
      files.push({ relativePath, absolutePath, category, agentId, coreFileType });
    }
  }

  private addGlobalCoreFiles(files: TrackedFileInfo[]): void {
    const workspaceDir = path.join(this.openclawDir, 'workspace');
    if (!fs.existsSync(workspaceDir)) return;

    const coreFileMap: Record<string, CoreFileType> = {
      'IDENTITY.md': 'identity',
      'SOUL.md': 'soul',
      'AGENTS.md': 'agents',
      'TOOLS.md': 'tools',
      'USER.md': 'user',
      'HEARTBEAT.md': 'heartbeat',
    };

    for (const [fileName, fileType] of Object.entries(coreFileMap)) {
      this.addFileIfExists(files, `workspace/${fileName}`, 'core', undefined, fileType);
    }

    // 其他全局 md 文件 → workspace 类别
    try {
      const entries = fs.readdirSync(workspaceDir);
      for (const entry of entries) {
        if (entry.endsWith('.md') && !coreFileMap[entry]) {
          this.addFileIfExists(files, `workspace/${entry}`, 'workspace');
        }
      }
    } catch {
      // 目录不可读，跳过
    }
  }

  private addAgentCoreFiles(files: TrackedFileInfo[]): void {
    const agentsWorkspaceDir = path.join(this.openclawDir, 'workspace', 'agents');
    if (!fs.existsSync(agentsWorkspaceDir)) return;

    const coreFileMap: Record<string, CoreFileType> = {
      'IDENTITY.md': 'identity',
      'SOUL.md': 'soul',
      'AGENTS.md': 'agents',
      'TOOLS.md': 'tools',
      'USER.md': 'user',
      'HEARTBEAT.md': 'heartbeat',
    };

    try {
      const agentDirs = fs.readdirSync(agentsWorkspaceDir);
      for (const agentDir of agentDirs) {
        const agentPath = path.join(agentsWorkspaceDir, agentDir);
        if (!fs.statSync(agentPath).isDirectory()) continue;

        const agentId = agentDir;

        // 核心 md 文件
        for (const [fileName, fileType] of Object.entries(coreFileMap)) {
          this.addFileIfExists(
            files,
            `workspace/agents/${agentDir}/${fileName}`,
            'core',
            agentId,
            fileType
          );
        }

        // 其他 md 文件（工作定义等）→ work_doc 类别
        try {
          const entries = fs.readdirSync(agentPath);
          for (const entry of entries) {
            if (entry.endsWith('.md') && !coreFileMap[entry]) {
              this.addFileIfExists(
                files,
                `workspace/agents/${agentDir}/${entry}`,
                'work_doc',
                agentId
              );
            }
          }
        } catch {
          // 目录不可读，跳过
        }
      }
    } catch {
      // 目录不可读，跳过
    }
  }

  private addSessionFiles(files: TrackedFileInfo[]): void {
    const agentsDir = path.join(this.openclawDir, 'agents');
    if (!fs.existsSync(agentsDir)) return;

    try {
      const agentDirs = fs.readdirSync(agentsDir);
      for (const agentDir of agentDirs) {
        const sessionsDir = path.join(agentsDir, agentDir, 'sessions');
        if (!fs.existsSync(sessionsDir)) continue;

        try {
          const sessionFiles = fs.readdirSync(sessionsDir);
          for (const sessionFile of sessionFiles) {
            if (sessionFile.endsWith('.jsonl')) {
              this.addFileIfExists(
                files,
                `agents/${agentDir}/sessions/${sessionFile}`,
                'session',
                agentDir
              );
            }
          }
        } catch {
          // 目录不可读，跳过
        }
      }
    } catch {
      // 目录不可读，跳过
    }
  }

  private addMemoryFiles(files: TrackedFileInfo[]): void {
    const memoryDir = path.join(this.openclawDir, 'memory');
    if (!fs.existsSync(memoryDir)) return;

    try {
      const entries = fs.readdirSync(memoryDir);
      for (const entry of entries) {
        if (entry.endsWith('.sqlite')) {
          this.addFileIfExists(files, `memory/${entry}`, 'memory');
        }
      }
    } catch {
      // 目录不可读，跳过
    }
  }
}

export interface TrackedFileInfo {
  relativePath: string;
  absolutePath: string;
  category: TrackedFileCategory;
  agentId?: string;
  coreFileType?: CoreFileType;
}
