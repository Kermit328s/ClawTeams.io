// ============================================================
// MainArea -- 四视图切换
// ============================================================

import React from 'react';
import { useClawStore } from '../../store';
import type { ViewType } from '../../types';
import { TopologyView } from '../views/TopologyView';
import { TimelineView } from '../views/TimelineView';
import { GridView } from '../views/GridView';
import { ArtifactView } from '../views/ArtifactView';

const VIEW_TABS: { key: ViewType; label: string; emoji: string }[] = [
  { key: 'topology', label: '\u62D3\u6251\u56FE', emoji: '\uD83D\uDD78\uFE0F' },
  { key: 'timeline', label: '\u65F6\u95F4\u7EBF', emoji: '\u23F1' },
  { key: 'grid', label: '\u7F51\u683C', emoji: '\u25A6' },
  { key: 'artifact', label: '\u6863\u6848', emoji: '\uD83D\uDCC1' },
];

const ViewComponent: Record<ViewType, React.FC> = {
  topology: TopologyView,
  timeline: TimelineView,
  grid: GridView,
  artifact: ArtifactView,
};

export const MainArea: React.FC = () => {
  const activeView = useClawStore((s) => s.activeView);
  const setActiveView = useClawStore((s) => s.setActiveView);

  const ActiveComponent = ViewComponent[activeView];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Tab bar */}
      <div className="h-8 bg-ct-bg-secondary/50 border-b border-ct-bg-tertiary flex items-center px-2 gap-1 shrink-0">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              activeView === tab.key
                ? 'bg-ct-bg-tertiary text-ct-text-primary'
                : 'text-ct-text-secondary hover:text-ct-text-primary hover:bg-ct-bg-tertiary/50'
            }`}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0">
        <ActiveComponent />
      </div>
    </div>
  );
};
