/**
 * Context Injector（上下文注入器）
 *
 * 任务下发前从团队大脑拉取上下文 -> 注入龙虾输入
 * 龙虾带着团队上下文工作但无需感知注入过程
 */

import type { TaskContext, StateUnit } from '../../infra/shared';

/** 大脑读取接口（由大脑板块实现） */
export interface BrainReader {
  /** 获取任务上下文 */
  getTaskContext(taskId: string, teamId: string): Promise<TaskContext | null>;
  /** 获取上游任务的状态单元 */
  getUpstreamStateUnits(taskId: string): Promise<StateUnit[]>;
  /** 获取团队级别的共享上下文 */
  getTeamContext(teamId: string): Promise<Record<string, unknown>>;
}

export interface ContextInjectorOptions {
  /** 大脑读取器 */
  brainReader?: BrainReader;
}

export interface TaskAssignInput {
  task_id: string;
  task_type: string;
  input: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  deadline: string;
  context?: Record<string, unknown>;
}

export interface EnrichedTaskAssign extends TaskAssignInput {
  context: Record<string, unknown>;
}

export class ContextInjector {
  private readonly brainReader?: BrainReader;

  constructor(options: ContextInjectorOptions = {}) {
    this.brainReader = options.brainReader;
  }

  /**
   * 为任务下发注入上下文
   * 在原始任务输入基础上，注入团队大脑中的相关上下文信息
   */
  async enrichTaskAssignment(
    task: TaskAssignInput,
    teamId: string,
  ): Promise<EnrichedTaskAssign> {
    const context: Record<string, unknown> = { ...(task.context ?? {}) };

    if (!this.brainReader) {
      return { ...task, context };
    }

    // 1. 获取任务上下文
    const taskContext = await this.brainReader.getTaskContext(
      task.task_id,
      teamId,
    );
    if (taskContext) {
      context._task_context = taskContext;
    }

    // 2. 获取上游任务的状态单元
    const upstreamUnits = await this.brainReader.getUpstreamStateUnits(
      task.task_id,
    );
    if (upstreamUnits.length > 0) {
      context._upstream_results = upstreamUnits.map((unit) => ({
        task_id: unit.task_id,
        agent_id: unit.agent_id,
        state: unit.state,
        result: unit.result,
        artifact_ids: unit.artifact_ids,
      }));
    }

    // 3. 获取团队共享上下文
    const teamContext = await this.brainReader.getTeamContext(teamId);
    if (teamContext && Object.keys(teamContext).length > 0) {
      context._team_context = teamContext;
    }

    return { ...task, context };
  }
}
