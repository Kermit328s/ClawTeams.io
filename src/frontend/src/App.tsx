// ============================================================
// App -- 主布局
// ============================================================

import React, { useEffect } from 'react';
import { useClawStore } from './store';
import { api } from './api/client';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { TopBar } from './components/layout/TopBar';
import { LeftPanel } from './components/layout/LeftPanel';
import { MainArea } from './components/layout/MainArea';
import { BottomLog } from './components/layout/BottomLog';
import { DetailPanel } from './components/layout/DetailPanel';
import type { Claw, Workspace } from './types';

const App: React.FC = () => {
  const setClaws = useClawStore((s) => s.setClaws);
  const setWorkspaceId = useClawStore((s) => s.setWorkspaceId);
  const detailTarget = useClawStore((s) => s.detailTarget);

  // Connect WebSocket
  useRealtimeSync();

  // Initial data fetch
  useEffect(() => {
    api
      .getWorkspaces()
      .then((workspaces) => {
        const ws = (workspaces as Workspace[])[0];
        if (!ws) return;

        setWorkspaceId(ws.workspace_id);

        return api.getClaws(ws.workspace_id).then((claws) => {
          setClaws(claws as Claw[]);
        });
      })
      .catch((err) => {
        console.error('Failed to load initial data:', err);
      });
  }, [setClaws, setWorkspaceId]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-ct-bg-primary">
      {/* Top bar */}
      <TopBar />

      {/* Middle: LeftPanel + MainArea + DetailPanel */}
      <div className="flex-1 flex min-h-0">
        <LeftPanel />
        <MainArea />
        {detailTarget && <DetailPanel />}
      </div>

      {/* Bottom log */}
      <BottomLog />
    </div>
  );
};

export default App;
