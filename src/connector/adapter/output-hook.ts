/**
 * Output Hook（输出拦截器）
 *
 * 捕获龙虾执行输出 -> 转换为标准化状态对象（StateUnit）-> 写入团队大脑
 * 同时发布相应事件到事件总线
 */

import type { ClawTeamsEvent, EventType } from '../../infra/shared';
import type { StateUnit, StructuredResult } from '../../infra/shared';
import type { TaskReportPayload, TaskReportState } from '../types';
import type { EventBusImpl } from '../eventbus/event-bus';
import { generateId } from '../utils';

/** 大脑写入接口（由大脑板块实现） */
export interface BrainWriter {
  /** 写入状态单元到大脑 */
  writeStateUnit(stateUnit: StateUnit): Promise<void>;
}

export interface OutputHookOptions {
  /** 事件总线 */
  eventBus: EventBusImpl;
  /** 大脑写入器 */
  brainWriter?: BrainWriter;
}

export class OutputHook {
  private readonly eventBus: EventBusImpl;
  private readonly brainWriter?: BrainWriter;

  constructor(options: OutputHookOptions) {
    this.eventBus = options.eventBus;
    this.brainWriter = options.brainWriter;
  }

  /**
   * 处理龙虾的任务上报
   * 1. 将上报转换为标准化 StateUnit
   * 2. 写入大脑
   * 3. 发布对应事件
   */
  async handleTaskReport(report: TaskReportPayload): Promise<StateUnit | null> {
    // 只有终态才生成 StateUnit
    const terminalStates: TaskReportState[] = [
      'completed',
      'failed',
      'blocked',
      'human_required',
    ];

    if (!terminalStates.includes(report.state)) {
      // 非终态（如 accepted, running），仅发布进度事件
      await this.publishProgressEvent(report);
      return null;
    }

    // 构建标准化状态对象
    const stateUnit = this.buildStateUnit(report);

    // 写入大脑
    if (this.brainWriter) {
      await this.brainWriter.writeStateUnit(stateUnit);
    }

    // 发布终态事件
    await this.publishCompletionEvent(report, stateUnit);

    return stateUnit;
  }

  /**
   * 构建标准化 StateUnit
   */
  private buildStateUnit(report: TaskReportPayload): StateUnit {
    const result: StructuredResult = {
      type: 'json',
      data: report.state_unit ?? {},
      summary: `Task ${report.task_id} ${report.state}`,
    };

    if (report.error) {
      result.data = {
        error: report.error,
        original: report.state_unit,
      };
    }

    return {
      task_id: report.task_id,
      agent_id: report.agent_id,
      state: report.state as StateUnit['state'],
      result,
      artifact_ids: [],
      timestamp: new Date().toISOString(),
      version: 1,
      upstream_task_ids: [],
      downstream_task_ids: [],
    };
  }

  /**
   * 发布进度事件（非终态）
   */
  private async publishProgressEvent(
    report: TaskReportPayload,
  ): Promise<void> {
    const eventType: EventType =
      report.state === 'accepted' ? 'task.assigned' : 'task.started';

    const event: ClawTeamsEvent = {
      event_id: generateId(),
      event_type: eventType,
      source: {
        service: 'connector',
        agent_id: report.agent_id,
      },
      timestamp: new Date().toISOString(),
      payload: {
        task_id: report.task_id,
        agent_id: report.agent_id,
        state: report.state,
        progress_percent: report.progress_percent,
      },
    };

    await this.eventBus.publish(event);
  }

  /**
   * 发布终态事件
   */
  private async publishCompletionEvent(
    report: TaskReportPayload,
    stateUnit: StateUnit,
  ): Promise<void> {
    const eventTypeMap: Record<string, EventType> = {
      completed: 'task.completed',
      failed: 'task.failed',
      blocked: 'task.blocked',
      human_required: 'task.human_required',
    };

    const eventType = eventTypeMap[report.state] ?? 'task.completed';

    const event: ClawTeamsEvent = {
      event_id: generateId(),
      event_type: eventType,
      source: {
        service: 'connector',
        agent_id: report.agent_id,
      },
      timestamp: new Date().toISOString(),
      payload: {
        task_id: report.task_id,
        agent_id: report.agent_id,
        state: report.state,
        state_unit: stateUnit,
      },
    };

    await this.eventBus.publish(event);
  }
}
