import React, { useEffect } from 'react';
import { useOnboardingStore, useMapStore } from '@/store';

/**
 * Step 4: Push tasks down to responsible people.
 */
export const StepPushDown: React.FC = () => {
  const { pushStatus, setPushStatus, nextStep, prevStep } =
    useOnboardingStore();
  const { nodes } = useMapStore();

  const taskNodes = nodes.filter((n) => (n.data as any)?.nodeType === 'task');

  const handlePush = () => {
    setPushStatus('pushing');
    // Simulate push
    setTimeout(() => {
      setPushStatus('done');
    }, 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h2 className="text-xl font-semibold text-claw-text">向下传递</h2>
        <p className="text-sm text-claw-muted mt-2">
          将任务自动推送给相关负责人，他们可以看到 AI 建议的任务分解并确认
        </p>
      </div>

      {/* Task list to push */}
      <div className="space-y-2">
        {taskNodes.map((node) => {
          const data = node.data as any;
          return (
            <div
              key={node.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-claw-bg border border-claw-border"
            >
              <div className="w-2 h-2 rounded-full bg-claw-info" />
              <span className="text-sm text-claw-text flex-1">
                {data.label}
              </span>
              <span className="text-[10px] text-claw-muted px-2 py-0.5 rounded bg-claw-surface">
                待分配
              </span>
            </div>
          );
        })}
        {taskNodes.length === 0 && (
          <p className="text-sm text-claw-muted text-center py-8">
            没有需要推送的任务节点
          </p>
        )}
      </div>

      {/* Push button */}
      {pushStatus === 'idle' && taskNodes.length > 0 && (
        <button
          onClick={handlePush}
          className="w-full py-3 rounded-lg bg-claw-primary text-white text-sm font-medium hover:bg-claw-primary/80 transition-colors"
        >
          推送 {taskNodes.length} 个任务给负责人
        </button>
      )}

      {pushStatus === 'pushing' && (
        <div className="flex items-center justify-center gap-2 py-3 text-claw-muted text-sm">
          <div className="w-4 h-4 border-2 border-claw-primary border-t-transparent rounded-full animate-spin" />
          <span>正在推送...</span>
        </div>
      )}

      {pushStatus === 'done' && (
        <div className="text-center py-3 text-claw-success text-sm">
          推送完成！负责人将收到通知。
        </div>
      )}

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
          disabled={pushStatus !== 'done'}
          className="px-6 py-2.5 rounded-lg bg-claw-primary text-white text-sm font-medium hover:bg-claw-primary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          下一步: 启动执行
        </button>
      </div>
    </div>
  );
};
