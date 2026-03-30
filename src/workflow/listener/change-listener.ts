/**
 * 变化监听器（Change Listener）
 * 监听意图图谱变更事件，分级处理变化
 *
 * 变化分级：
 *   微小 → 动态更新参数
 *   中等 → 检查点注入
 *   重大 → 暂停 + 重新生成 + 人工确认
 *
 * 意图缓冲区：10分钟内合并变化
 */

import type {
  ClawTeamsEvent,
  EventBus,
  EventHandler,
} from '../../infra/shared';

import type {
  ChangeLevel,
  IntentChange,
  ChangeBuffer,
} from '../types';

// ─── 缓冲区配置 ───
const DEFAULT_BUFFER_WINDOW_MS = 10 * 60 * 1000; // 10 分钟
const INTENT_UNSTABLE_THRESHOLD = 5; // 缓冲窗口内变化超过此数则警告

// ─── 变化分级规则 ───
export function classifyChange(change: IntentChange): ChangeLevel {
  // 重大变化：核心意图变更（删除或新增大量节点、修改 Goal 节点）
  if (change.removed_nodes.length > 0) return 'major';
  if (change.added_nodes.length > 2) return 'major';
  if (change.removed_edges.length > 2) return 'major';

  // 中等变化：新增依赖、少量新节点
  if (change.added_nodes.length > 0) return 'moderate';
  if (change.added_edges.length > 0) return 'moderate';
  if (change.removed_edges.length > 0) return 'moderate';

  // 微小变化：仅修改已有节点参数
  if (change.modified_nodes.length > 0) return 'minor';

  return 'minor';
}

/**
 * 合并多个变化的等级（取最高）
 */
export function mergeChangeLevel(levels: ChangeLevel[]): ChangeLevel {
  if (levels.includes('major')) return 'major';
  if (levels.includes('moderate')) return 'moderate';
  return 'minor';
}

/**
 * 变化响应处理器接口
 */
export interface ChangeResponseHandler {
  /** 微小变化：动态更新 Activity 参数 */
  handleMinorChange(goalId: string, changes: IntentChange[]): Promise<void>;
  /** 中等变化：在下一个检查点注入修改 */
  handleModerateChange(goalId: string, changes: IntentChange[]): Promise<void>;
  /** 重大变化：暂停工作流 + 触发重新生成 + 请求人工确认 */
  handleMajorChange(goalId: string, changes: IntentChange[]): Promise<void>;
}

/**
 * 变化监听器
 */
export class ChangeListener {
  private buffers = new Map<string, ChangeBuffer>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private bufferWindowMs: number;
  private responseHandler: ChangeResponseHandler;
  private eventBus: EventBus;
  private subscription: { unsubscribe: () => void } | null = null;

  constructor(opts: {
    eventBus: EventBus;
    responseHandler: ChangeResponseHandler;
    bufferWindowMs?: number;
  }) {
    this.eventBus = opts.eventBus;
    this.responseHandler = opts.responseHandler;
    this.bufferWindowMs = opts.bufferWindowMs ?? DEFAULT_BUFFER_WINDOW_MS;
  }

  /**
   * 启动监听
   */
  async start(): Promise<void> {
    this.subscription = await this.eventBus.subscribe(
      'intent.graph_updated',
      this.onGraphUpdated.bind(this) as EventHandler,
    );
  }

  /**
   * 停止监听
   */
  async stop(): Promise<void> {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    // 刷新所有缓冲区
    for (const goalId of this.buffers.keys()) {
      await this.flushBuffer(goalId);
    }
    // 清除所有定时器
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    this.flushTimers.clear();
  }

  /**
   * 接收图谱变更事件
   */
  private async onGraphUpdated(event: ClawTeamsEvent): Promise<void> {
    const payload = event.payload as {
      goal_id: string;
      added_nodes?: string[];
      removed_nodes?: string[];
      modified_nodes?: string[];
      added_edges?: string[];
      removed_edges?: string[];
      description?: string;
    };

    const change: IntentChange = {
      change_id: event.event_id,
      goal_id: payload.goal_id,
      level: 'minor', // 临时，会重新计算
      description: payload.description ?? '',
      added_nodes: payload.added_nodes ?? [],
      removed_nodes: payload.removed_nodes ?? [],
      modified_nodes: payload.modified_nodes ?? [],
      added_edges: payload.added_edges ?? [],
      removed_edges: payload.removed_edges ?? [],
      received_at: event.timestamp,
    };

    // 计算实际变化等级
    change.level = classifyChange(change);

    // 放入缓冲区
    this.bufferChange(change);
  }

  /**
   * 将变化放入缓冲区
   */
  bufferChange(change: IntentChange): void {
    const { goal_id } = change;
    const now = new Date().toISOString();

    let buffer = this.buffers.get(goal_id);
    if (!buffer) {
      buffer = {
        goal_id,
        changes: [],
        buffer_start: now,
        last_change_at: now,
        merged_level: 'minor',
      };
      this.buffers.set(goal_id, buffer);
    }

    buffer.changes.push(change);
    buffer.last_change_at = now;
    buffer.merged_level = mergeChangeLevel(buffer.changes.map((c) => c.level));

    // 重大变化立即刷新
    if (change.level === 'major') {
      this.flushBuffer(goal_id);
      return;
    }

    // 意图不稳定警告
    if (buffer.changes.length >= INTENT_UNSTABLE_THRESHOLD) {
      console.warn(
        `[ChangeListener] 目标 ${goal_id} 的意图变化频率过高（${buffer.changes.length} 次）。建议先稳定意图再继续执行。`,
      );
    }

    // 重置刷新定时器
    const existingTimer = this.flushTimers.get(goal_id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.flushBuffer(goal_id);
    }, this.bufferWindowMs);

    this.flushTimers.set(goal_id, timer);
  }

  /**
   * 刷新缓冲区，按合并后的等级分派处理
   */
  async flushBuffer(goalId: string): Promise<void> {
    const buffer = this.buffers.get(goalId);
    if (!buffer || buffer.changes.length === 0) return;

    const changes = [...buffer.changes];
    const level = buffer.merged_level;

    // 清空缓冲区
    this.buffers.delete(goalId);
    const timer = this.flushTimers.get(goalId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(goalId);
    }

    // 按等级分派
    switch (level) {
      case 'minor':
        await this.responseHandler.handleMinorChange(goalId, changes);
        break;
      case 'moderate':
        await this.responseHandler.handleModerateChange(goalId, changes);
        break;
      case 'major':
        await this.responseHandler.handleMajorChange(goalId, changes);
        break;
    }
  }

  /**
   * 获取当前缓冲区状态（用于调试/监控）
   */
  getBufferState(goalId: string): ChangeBuffer | undefined {
    return this.buffers.get(goalId);
  }

  /**
   * 获取所有活跃缓冲区的目标 ID
   */
  getActiveBufferGoalIds(): string[] {
    return Array.from(this.buffers.keys());
  }
}
