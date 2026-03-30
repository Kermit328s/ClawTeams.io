import React from 'react';
import { useNavigate } from 'react-router-dom';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-claw-bg">
      <header className="h-12 flex items-center justify-between px-4 border-b border-claw-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded hover:bg-claw-border/50 text-claw-muted hover:text-claw-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-claw-text">设置</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Team settings */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-claw-text">团队设置</h2>
          <div className="bg-claw-surface rounded-lg border border-claw-border divide-y divide-claw-border">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-claw-text">团队名称</p>
                <p className="text-xs text-claw-muted">我的团队</p>
              </div>
              <button className="text-xs text-claw-primary hover:underline">
                修改
              </button>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-claw-text">团队成员</p>
                <p className="text-xs text-claw-muted">3 位成员</p>
              </div>
              <button className="text-xs text-claw-primary hover:underline">
                管理
              </button>
            </div>
          </div>
        </section>

        {/* Connection settings */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-claw-text">连接设置</h2>
          <div className="bg-claw-surface rounded-lg border border-claw-border divide-y divide-claw-border">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-claw-text">Brain API</p>
                <p className="text-xs text-claw-muted">http://localhost:3000/api/v1</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-claw-success/10 text-claw-success">
                已连接
              </span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-claw-text">WebSocket</p>
                <p className="text-xs text-claw-muted">ws://localhost:3000/ws</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-claw-success/10 text-claw-success">
                已连接
              </span>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-claw-text">关于</h2>
          <div className="bg-claw-surface rounded-lg border border-claw-border px-4 py-3">
            <p className="text-sm text-claw-text">ClawTeams v0.1.0</p>
            <p className="text-xs text-claw-muted mt-1">
              团队意图可视化与执行平台
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
