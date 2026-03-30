/**
 * WebSocket 服务端
 * 处理龙虾和前端的 WebSocket 连接，路由消息到对应处理器
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import type {
  MessageFrame,
  AgentRegisterPayload,
  AgentHeartbeatPayload,
  TaskReportPayload,
  EventSubscribePayload,
  EventSubscribeAckPayload,
  EventPushPayload,
} from '../types';
import { ConnectionManager } from './connection-manager';
import { EventBusImpl } from '../eventbus/event-bus';
import { deserializeFrame, createFrame, serializeFrame } from '../utils';
import type { ClawTeamsEvent } from '../../infra/shared';

export interface WsServerOptions {
  /** HTTP 服务器（可选，不传则独立监听端口） */
  server?: HttpServer;
  /** 监听端口（仅当不传 server 时有效） */
  port?: number;
  /** WebSocket 路径 */
  path?: string;
  /** 连接管理器 */
  connectionManager: ConnectionManager;
  /** 事件总线 */
  eventBus: EventBusImpl;
  /** 任务上报回调 */
  onTaskReport?: (payload: TaskReportPayload, frame: MessageFrame<TaskReportPayload>) => Promise<void>;
}

export class WsServer {
  private wss: WebSocketServer | null = null;
  private readonly connectionManager: ConnectionManager;
  private readonly eventBus: EventBusImpl;
  private readonly onTaskReport?: WsServerOptions['onTaskReport'];
  private readonly options: WsServerOptions;

  /** 前端 WebSocket 连接池 */
  private frontendClients = new Set<WebSocket>();

  constructor(options: WsServerOptions) {
    this.options = options;
    this.connectionManager = options.connectionManager;
    this.eventBus = options.eventBus;
    this.onTaskReport = options.onTaskReport;
  }

  /**
   * 启动 WebSocket 服务
   */
  start(): void {
    const wssOptions: Record<string, unknown> = {};
    if (this.options.server) {
      wssOptions.server = this.options.server;
    } else {
      wssOptions.port = this.options.port ?? 8080;
    }
    if (this.options.path) {
      wssOptions.path = this.options.path;
    }

    this.wss = new WebSocketServer(wssOptions as any);

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // 监听事件总线，将事件推送给订阅的龙虾和前端
    this.eventBus.onEventPublished((event) => {
      this.pushEventToSubscribers(event);
      this.pushEventToFrontend(event);
    });

    this.connectionManager.startHeartbeatCheck();
  }

  /**
   * 关闭 WebSocket 服务
   */
  close(): void {
    this.connectionManager.closeAll();
    this.frontendClients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  /**
   * 处理新连接
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const clientType = url.searchParams.get('type');

    if (clientType === 'frontend') {
      this.frontendClients.add(ws);
      ws.on('close', () => {
        this.frontendClients.delete(ws);
      });
      return;
    }

    // 龙虾连接：临时跟踪，待注册后关联 agent_id
    let registeredAgentId: string | null = null;

    ws.on('message', async (data: Buffer | string) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf-8');
        const frame = deserializeFrame(raw);
        await this.routeMessage(ws, frame, (agentId) => {
          registeredAgentId = agentId;
        });
      } catch (err) {
        const errorFrame = createFrame('error', {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
        ws.send(serializeFrame(errorFrame));
      }
    });

    ws.on('close', () => {
      if (registeredAgentId) {
        this.connectionManager.handleDisconnect(registeredAgentId);
      }
    });

    ws.on('error', () => {
      if (registeredAgentId) {
        this.connectionManager.handleDisconnect(registeredAgentId);
      }
    });
  }

  /**
   * 路由消息到对应处理器
   */
  private async routeMessage(
    ws: WebSocket,
    frame: MessageFrame,
    setAgentId: (id: string) => void,
  ): Promise<void> {
    switch (frame.msg_type) {
      case 'agent.register': {
        const regFrame = frame as MessageFrame<AgentRegisterPayload>;
        setAgentId(regFrame.payload.agent_id);
        await this.connectionManager.handleRegister(ws, regFrame);
        break;
      }

      case 'agent.heartbeat': {
        const hbFrame = frame as MessageFrame<AgentHeartbeatPayload>;
        this.connectionManager.handleHeartbeat(ws, hbFrame);
        break;
      }

      case 'task.report': {
        const reportFrame = frame as MessageFrame<TaskReportPayload>;
        if (this.onTaskReport) {
          await this.onTaskReport(reportFrame.payload, reportFrame);
        }
        break;
      }

      case 'event.subscribe': {
        const subFrame = frame as MessageFrame<EventSubscribePayload>;
        const { agent_id, event_patterns } = subFrame.payload;
        this.connectionManager.updateSubscriptions(agent_id, event_patterns);
        const ack = createFrame<EventSubscribeAckPayload>(
          'event.subscribe_ack',
          { subscribed_patterns: event_patterns },
          frame.msg_id,
        );
        ws.send(serializeFrame(ack));
        break;
      }

      default:
        const errorFrame = createFrame('error', {
          code: 'INTERNAL_ERROR',
          message: `Unknown message type: ${frame.msg_type}`,
        });
        ws.send(serializeFrame(errorFrame));
    }
  }

  /**
   * 将事件推送给订阅的龙虾
   */
  private pushEventToSubscribers(event: ClawTeamsEvent): void {
    const subscribedAgents =
      this.connectionManager.getSubscribedAgents(event.event_type);

    const pushFrame = createFrame<EventPushPayload>('event.push', { event });

    for (const agentId of subscribedAgents) {
      this.connectionManager.sendToAgent(agentId, pushFrame);
    }
  }

  /**
   * 将事件推送给所有前端
   */
  private pushEventToFrontend(event: ClawTeamsEvent): void {
    const pushFrame = createFrame<EventPushPayload>('event.push', { event });
    const data = serializeFrame(pushFrame);

    for (const client of this.frontendClients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  /**
   * 向指定龙虾下发任务
   */
  assignTask(
    agentId: string,
    taskPayload: {
      task_id: string;
      task_type: string;
      input: Record<string, unknown>;
      priority?: 'critical' | 'high' | 'medium' | 'low';
      deadline: string;
      context?: Record<string, unknown>;
    },
  ): boolean {
    const frame = createFrame('task.assign', taskPayload);
    return this.connectionManager.sendToAgent(agentId, frame);
  }
}
