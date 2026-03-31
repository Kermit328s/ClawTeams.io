// ============================================================
// ClawTeams WebSocket 服务端
// ============================================================

import * as http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Database } from '../store/database';
import { HookMessage, FrontendEvent, VALID_HOOK_TYPES } from './types';
import { HookHandler } from './hook-handler';
import { FrontendPusher } from './frontend-pusher';

export interface WsServerOptions {
  port: number;
  db: Database;
  onHookEvent?: (msg: HookMessage) => void;
}

/**
 * WebSocket 服务端
 *
 * 两个端点：
 * - /ws/hook      — 龙虾 Plugin 连接（接收 Hook 事件）
 * - /ws/frontend  — 前端连接（推送实时事件）
 */
export class WsServer {
  private port: number;
  private httpServer: http.Server;
  private hookWss: WebSocketServer;
  private frontendWss: WebSocketServer;
  private hookHandler: HookHandler;
  private frontendPusher: FrontendPusher;
  private onHookEvent?: (msg: HookMessage) => void;

  // 心跳检测
  private readonly HEARTBEAT_INTERVAL = 30_000; // 30 秒
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private aliveMap: WeakMap<WebSocket, boolean> = new WeakMap();

  constructor(options: WsServerOptions) {
    this.port = options.port;
    this.onHookEvent = options.onHookEvent;

    // 前端推送管理
    this.frontendPusher = new FrontendPusher();

    // Hook 事件处理器
    this.hookHandler = new HookHandler(options.db, (event) => this.broadcastToFrontend(event));

    // HTTP 服务（用于区分 WebSocket 路径）
    this.httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ClawTeams WebSocket Server');
    });

    // 两个 WebSocket 服务（noServer 模式）
    this.hookWss = new WebSocketServer({ noServer: true });
    this.frontendWss = new WebSocketServer({ noServer: true });

    this.setupUpgradeHandler();
    this.setupHookWss();
    this.setupFrontendWss();
  }

  /**
   * 启动服务
   */
  start(): void {
    this.httpServer.listen(this.port, () => {
      console.log(`[WsServer] WebSocket 服务已启动，端口: ${this.port}`);
      console.log(`[WsServer]   Hook 端点:     ws://localhost:${this.port}/ws/hook`);
      console.log(`[WsServer]   Frontend 端点: ws://localhost:${this.port}/ws/frontend`);
    });

    // 启动心跳检测
    this.startHeartbeat();
  }

  /**
   * 停止服务
   */
  stop(): void {
    console.log('[WsServer] 正在关闭...');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.frontendPusher.closeAll();

    // 关闭所有 hook 连接
    for (const client of this.hookWss.clients) {
      try {
        client.close(1001, 'Server shutting down');
      } catch {
        // 忽略
      }
    }

    this.hookWss.close();
    this.frontendWss.close();
    this.httpServer.close();

    console.log('[WsServer] 已关闭');
  }

  /**
   * 向所有前端连接广播事件
   */
  broadcastToFrontend(event: FrontendEvent): void {
    this.frontendPusher.broadcast(event);
  }

  /**
   * 获取服务实际监听端口（port=0 时分配的随机端口）
   */
  getPort(): number {
    const addr = this.httpServer.address();
    if (typeof addr === 'object' && addr) return addr.port;
    return this.port;
  }

  /**
   * 获取连接统计
   */
  getStats(): { hookConnections: number; frontendConnections: number } {
    return {
      hookConnections: this.hookWss.clients.size,
      frontendConnections: this.frontendPusher.getConnectionCount(),
    };
  }

  // ---- 内部方法 ----

  /**
   * HTTP upgrade 处理：根据路径分发到对应的 WebSocket 服务
   */
  private setupUpgradeHandler(): void {
    this.httpServer.on('upgrade', (request, socket, head) => {
      const pathname = request.url ?? '';

      if (pathname === '/ws/hook') {
        this.hookWss.handleUpgrade(request, socket, head, (ws) => {
          this.hookWss.emit('connection', ws, request);
        });
      } else if (pathname === '/ws/frontend') {
        this.frontendWss.handleUpgrade(request, socket, head, (ws) => {
          this.frontendWss.emit('connection', ws, request);
        });
      } else {
        console.warn(`[WsServer] 未知路径: ${pathname}，断开连接`);
        socket.destroy();
      }
    });
  }

  /**
   * 设置 Hook WebSocket 处理
   */
  private setupHookWss(): void {
    this.hookWss.on('connection', (ws) => {
      console.log('[WsServer] 新的 Hook 连接');
      this.aliveMap.set(ws, true);

      ws.on('pong', () => {
        this.aliveMap.set(ws, true);
      });

      ws.on('message', (data) => {
        this.handleHookMessage(ws, data);
      });

      ws.on('close', () => {
        console.log('[WsServer] Hook 连接已断开');
      });

      ws.on('error', (err) => {
        console.error('[WsServer] Hook 连接错误:', err.message);
      });
    });
  }

  /**
   * 设置 Frontend WebSocket 处理
   */
  private setupFrontendWss(): void {
    this.frontendWss.on('connection', (ws) => {
      console.log('[WsServer] 新的前端连接');
      this.aliveMap.set(ws, true);
      this.frontendPusher.addConnection(ws);

      ws.on('pong', () => {
        this.aliveMap.set(ws, true);
      });

      ws.on('close', () => {
        this.frontendPusher.removeConnection(ws);
      });

      ws.on('error', (err) => {
        console.error('[WsServer] 前端连接错误:', err.message);
        this.frontendPusher.removeConnection(ws);
      });
    });
  }

  /**
   * 处理来自 Hook 连接的消息
   */
  private handleHookMessage(ws: WebSocket, data: WebSocket.RawData): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(data.toString());
    } catch {
      console.warn('[WsServer] Hook 消息 JSON 解析失败，忽略');
      this.sendError(ws, 'INVALID_JSON', '消息不是有效的 JSON');
      return;
    }

    // 验证消息格式
    if (!this.isValidHookMessage(parsed)) {
      console.warn('[WsServer] Hook 消息格式无效，忽略');
      this.sendError(ws, 'INVALID_FORMAT', '消息格式不正确，需要 { type, payload }');
      return;
    }

    const msg = parsed as HookMessage;

    try {
      // 交给 HookHandler 处理
      this.hookHandler.handle(msg);

      // 触发外部回调（如有）
      if (this.onHookEvent) {
        this.onHookEvent(msg);
      }
    } catch (err) {
      console.error(`[WsServer] 处理 Hook 消息失败 (type=${msg.type}):`, err);
      // 不断开连接，只记录日志
    }
  }

  /**
   * 验证 Hook 消息格式
   */
  private isValidHookMessage(data: unknown): data is HookMessage {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    if (typeof obj.type !== 'string') return false;
    if (!VALID_HOOK_TYPES.includes(obj.type as HookMessage['type'])) return false;
    if (typeof obj.payload !== 'object' || obj.payload === null) return false;
    return true;
  }

  /**
   * 向 WebSocket 发送错误消息
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ error: { code, message } }));
      } catch {
        // 忽略发送错误
      }
    }
  }

  /**
   * 心跳检测：每 30 秒 ping 所有连接，无 pong 则断开
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const checkAndPing = (wss: WebSocketServer) => {
        for (const ws of wss.clients) {
          if (this.aliveMap.get(ws) === false) {
            // 上次 ping 没收到 pong，断开
            ws.terminate();
            continue;
          }
          this.aliveMap.set(ws, false);
          ws.ping();
        }
      };

      checkAndPing(this.hookWss);
      checkAndPing(this.frontendWss);
    }, this.HEARTBEAT_INTERVAL);
  }
}
