import * as fs from 'fs';
import * as path from 'path';
import { SessionEntry, SessionMessage, TaskEvent } from './types';

/**
 * 会话 JSONL 增量解析器
 *
 * JSONL 格式：
 *   第1行: {"type":"session","version":3,"id":"...","timestamp":"..."}
 *   后续行: {"type":"message","id":"...","message":{"role":"user"|"assistant","content":"..."}}
 *   以及: model_change, thinking_level_change, custom 等类型
 */
export class SessionParser {
  /** 记录每个文件读到的行数 */
  private lastLineRead: Map<string, number> = new Map();

  /**
   * 增量读取新行
   */
  readNewLines(sessionFile: string): SessionEntry[] {
    const absolutePath = path.resolve(sessionFile);
    if (!fs.existsSync(absolutePath)) return [];

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    const lastLine = this.lastLineRead.get(absolutePath) ?? 0;
    const newLines = lines.slice(lastLine);
    this.lastLineRead.set(absolutePath, lines.length);

    const entries: SessionEntry[] = [];
    for (const line of newLines) {
      try {
        const parsed = JSON.parse(line) as SessionEntry;
        entries.push(parsed);
      } catch {
        // 行解析失败，跳过（可能是不完整的写入）
      }
    }

    return entries;
  }

  /**
   * 获取某个文件已读取的行数
   */
  getLastLineRead(sessionFile: string): number {
    return this.lastLineRead.get(path.resolve(sessionFile)) ?? 0;
  }

  /**
   * 设置某个文件已读取的行数（用于从数据库恢复状态）
   */
  setLastLineRead(sessionFile: string, lineNumber: number): void {
    this.lastLineRead.set(path.resolve(sessionFile), lineNumber);
  }

  /**
   * 从新行中提取任务事件
   *
   * 基于实际数据：一个"任务"= 一轮 user message + assistant response
   */
  extractTasks(entries: SessionEntry[], agentId: string): TaskEvent[] {
    const tasks: TaskEvent[] = [];
    let sessionId = '';
    let currentUserMessage: SessionMessage | null = null;
    let currentStartTime: Date | null = null;

    for (const entry of entries) {
      // 提取 session id
      if (entry.type === 'session') {
        sessionId = (entry as { id: string }).id ?? '';
        continue;
      }

      if (entry.type !== 'message') continue;
      const msg = entry as SessionMessage;

      if (msg.message.role === 'user') {
        // 新的用户消息 = 新任务开始
        currentUserMessage = msg;
        currentStartTime = new Date(msg.timestamp);
      } else if (msg.message.role === 'assistant' && currentUserMessage) {
        // 助手回复 = 任务完成
        const completedAt = new Date(msg.timestamp);
        const startedAt = currentStartTime ?? completedAt;

        const inputPreview = this.extractTextContent(currentUserMessage.message.content);
        const outputPreview = this.extractTextContent(msg.message.content);

        // 提取 token 用量（如果消息中有 usage 字段）
        const usage = (msg as unknown as Record<string, unknown>).usage as
          | { input_tokens?: number; output_tokens?: number }
          | undefined;

        // 提取工具调用
        const toolCalls = this.extractToolCalls(msg);

        tasks.push({
          session_id: sessionId,
          agent_id: agentId,
          trigger: this.detectTrigger(inputPreview),
          status: 'completed',
          input_preview: inputPreview.substring(0, 200),
          output_preview: outputPreview.substring(0, 200),
          token_input: usage?.input_tokens,
          token_output: usage?.output_tokens,
          token_total:
            usage?.input_tokens && usage?.output_tokens
              ? usage.input_tokens + usage.output_tokens
              : undefined,
          tool_calls: toolCalls,
          started_at: startedAt,
          completed_at: completedAt,
          duration_ms: completedAt.getTime() - startedAt.getTime(),
        });

        currentUserMessage = null;
        currentStartTime = null;
      }
    }

    return tasks;
  }

  /**
   * 从 content 中提取文本
   */
  private extractTextContent(content: string | { type: string; text?: string }[]): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text!)
        .join('\n');
    }
    return '';
  }

  /**
   * 检测触发类型
   */
  private detectTrigger(input: string): TaskEvent['trigger'] {
    const lower = input.toLowerCase();
    if (lower.includes('cron') || lower.includes('scheduled')) return 'cron';
    if (lower.includes('heartbeat')) return 'heartbeat';
    if (lower.includes('subagent') || lower.includes('sub-agent')) return 'subagent';
    // metadata 中包含 sender 信息说明是用户消息
    if (lower.includes('sender') || lower.includes('conversation info')) return 'user';
    return 'unknown';
  }

  /**
   * 从助手消息中提取工具调用
   */
  private extractToolCalls(
    msg: SessionMessage
  ): { name: string; input_preview: string; output_preview: string }[] {
    const calls: { name: string; input_preview: string; output_preview: string }[] = [];

    // 工具调用可能嵌入在 content 数组中
    if (Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' || block.type === 'tool_call') {
          const toolBlock = block as unknown as Record<string, unknown>;
          calls.push({
            name: (toolBlock.name as string) ?? 'unknown',
            input_preview: JSON.stringify(toolBlock.input ?? '').substring(0, 100),
            output_preview: '',
          });
        }
      }
    }

    return calls;
  }
}
