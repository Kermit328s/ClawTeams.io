import React from 'react';
import { useOnboardingStore, useMapStore } from '@/store';
import { MapPanel } from '@/map/MapPanel';

/**
 * Step 3: Review and adjust the generated map.
 * Shows the full map with confirm/adjust/delete for each node.
 */
export const StepReviewMap: React.FC = () => {
  const { pendingNodeIds, nextStep, prevStep } = useOnboardingStore();
  const { nodes } = useMapStore();

  const totalNodes = nodes.length;
  const draftNodes = nodes.filter((n) => (n.data as any)?.isDraft).length;
  const confirmedNodes = totalNodes - draftNodes;

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-claw-text">
            确认和调整地图
          </h2>
          <p className="text-sm text-claw-muted mt-1">
            点击每个节点，选择 &#10003; 确认 / &#9998; 调整 / &times; 删除
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-claw-muted">
            已确认 {confirmedNodes}/{totalNodes} 个节点
          </div>
          <div className="w-40 h-1.5 bg-claw-border rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-claw-success rounded-full transition-all"
              style={{
                width: totalNodes > 0
                  ? `${(confirmedNodes / totalNodes) * 100}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="h-[500px] rounded-lg border border-claw-border overflow-hidden">
        <MapPanel />
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-4 py-2 rounded-lg border border-claw-border text-sm text-claw-muted hover:text-claw-text hover:border-claw-text/30 transition-colors"
        >
          返回
        </button>
        <button
          onClick={nextStep}
          className="px-6 py-2.5 rounded-lg bg-claw-primary text-white text-sm font-medium hover:bg-claw-primary/80 transition-colors"
        >
          下一步: 向下传递
        </button>
      </div>
    </div>
  );
};
