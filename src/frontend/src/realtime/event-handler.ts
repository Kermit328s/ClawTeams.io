// ============================================================
// WebSocket 事件处理 — 更新 stores
// ============================================================

import type { FrontendEvent } from '../types';
import { useClawStore } from '../store/claw-store';
import { useGraphStore } from '../store/graph-store';
import { useActivityStore } from '../store/activity-store';

export function handleFrontendEvent(event: FrontendEvent): void {
  const payload = event.payload as Record<string, unknown>;

  switch (event.type) {
    case 'claw.status': {
      const clawId = payload.claw_id as string;
      const status = payload.status as 'online' | 'offline';
      useClawStore.getState().updateClawStatus(clawId, status);

      useActivityStore.getState().addEntry({
        timestamp: new Date(event.timestamp).toISOString(),
        emoji: status === 'online' ? '\uD83E\uDD9E' : '\uD83E\uDD9E',
        status: status === 'online' ? 'online' : 'offline',
        message: `${status === 'online' ? '\u4E0A\u7EBF' : '\u79BB\u7EBF'}`,
        type: 'claw_status',
      });
      break;
    }

    case 'agent.status': {
      const agentId = payload.agent_id as string;
      const status = payload.status as 'idle' | 'running' | 'failed';
      const currentTask = payload.current_task as string | undefined;
      useClawStore.getState().updateAgentStatus(agentId, status, currentTask);
      useGraphStore.getState().updateNodeStatus(agentId, status);
      break;
    }

    case 'execution.new': {
      const agentId = payload.agent_id as string;
      const agent = useClawStore.getState().getAgent(agentId);
      const emoji = agent?.emoji || '\u2753';

      useActivityStore.getState().addEntry({
        timestamp: new Date(event.timestamp).toISOString(),
        emoji,
        status: 'running',
        message: `\u5F00\u59CB "${(payload.input_preview as string)?.slice(0, 30) || '\u4EFB\u52A1'}"`,
        agent_id: agentId,
        type: 'execution',
      });
      break;
    }

    case 'execution.update': {
      const agentId = payload.agent_id as string;
      const execStatus = payload.status as string;
      const agent = useClawStore.getState().getAgent(agentId);
      const emoji = agent?.emoji || '\u2753';

      const statusText =
        execStatus === 'completed' ? '\u5B8C\u6210' :
        execStatus === 'failed' ? '\u5931\u8D25' : execStatus;

      useActivityStore.getState().addEntry({
        timestamp: new Date(event.timestamp).toISOString(),
        emoji,
        status: execStatus,
        message: `${statusText} "${(payload.output_preview as string)?.slice(0, 30) || '\u4EFB\u52A1'}"`,
        agent_id: agentId,
        type: 'execution',
      });
      break;
    }

    case 'subagent.spawned': {
      useActivityStore.getState().addEntry({
        timestamp: new Date(event.timestamp).toISOString(),
        emoji: '\uD83D\uDD17',
        status: 'spawned',
        message: `${payload.parent_key} \u2192 ${payload.child_key}: ${payload.task}`,
        type: 'subagent',
      });
      break;
    }

    case 'subagent.ended': {
      useActivityStore.getState().addEntry({
        timestamp: new Date(event.timestamp).toISOString(),
        emoji: '\uD83D\uDD17',
        status: payload.outcome as string,
        message: `${payload.child_key} \u5B8C\u6210`,
        type: 'subagent',
      });
      break;
    }

    case 'file.changed': {
      const agentId = payload.agent_id as string;
      const fileType = payload.file_type as string;
      const agent = useClawStore.getState().getAgent(agentId);

      if (agentId) {
        useClawStore.getState().setAgentFileChanged(agentId, true);
        useGraphStore.getState().setNodeFileChanged(agentId, true);
      }

      useActivityStore.getState().addEntry({
        timestamp: new Date(event.timestamp).toISOString(),
        emoji: '\uD83D\uDFE3',
        status: 'changed',
        message: `\u6587\u4EF6\u53D8\u66F4 ${agent?.emoji || ''} ${fileType?.toUpperCase() || ''}.md`,
        agent_id: agentId,
        type: 'file_change',
      });
      break;
    }
  }
}
