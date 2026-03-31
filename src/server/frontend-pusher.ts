// ============================================================
// ClawTeams 前端 WebSocket 推送管理
// ============================================================

import WebSocket from 'ws';
import { FrontendEvent } from './types';

/**
 * 管理前端 WebSocket 连接池，负责事件广播
 */
export class FrontendPusher {
  private connections: Set<WebSocket> = new Set();

  /**
   * 添加前端连接
   */
  addConnection(ws: WebSocket): void {
    this.connections.add(ws);
    console.log(`[FrontendPusher] 前端连接已添加，当前连接数: ${this.connections.size}`);
  }

  /**
   * 移除前端连接
   */
  removeConnection(ws: WebSocket): void {
    this.connections.delete(ws);
    console.log(`[FrontendPusher] 前端连接已移除，当前连接数: ${this.connections.size}`);
  }

  /**
   * 广播事件给所有前端连接
   */
  broadcast(event: FrontendEvent): void {
    const message = JSON.stringify(event);
    const deadConnections: WebSocket[] = [];

    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (err) {
          console.error('[FrontendPusher] 发送失败:', err);
          deadConnections.push(ws);
        }
      } else {
        deadConnections.push(ws);
      }
    }

    // 清理已断开的连接
    for (const ws of deadConnections) {
      this.connections.delete(ws);
    }
  }

  /**
   * 获取当前连接数
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * 关闭所有连接
   */
  closeAll(): void {
    for (const ws of this.connections) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        // 忽略关闭错误
      }
    }
    this.connections.clear();
  }
}
