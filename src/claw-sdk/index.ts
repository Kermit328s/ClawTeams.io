/**
 * ClawSDK - ClawTeams 龙虾端 SDK
 *
 * 为外部龙虾（OpenClaw 等）提供与团队大脑通信的 TypeScript SDK。
 *
 * @example
 * ```typescript
 * import { ClawClient } from '@clawteams/claw-sdk';
 *
 * const client = new ClawClient({
 *   serverUrl: 'ws://brain.clawteams.io/ws',
 *   agentId: 'your-agent-id',
 *   apiKey: 'your-api-key',
 *   capabilities: [
 *     { name: 'code_review', version: '1.0' },
 *   ],
 * });
 *
 * await client.connect();
 * ```
 */

export { ClawClient } from './client';
export type {
  ClawSDKConfig,
  ConnectionState,
  MessageFrame,
  AgentCapability,
  AgentRuntime,
  AgentHeartbeatStatus,
  AgentResourceUsage,
  TaskReportState,
  TaskAssignment,
  ClawEvent,
  TaskHandler,
  EventHandler,
  StateChangeHandler,
} from './types';
