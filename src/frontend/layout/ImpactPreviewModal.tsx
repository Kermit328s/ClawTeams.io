import React from 'react';
import type { ImpactPreview } from '@/types';

interface ImpactPreviewModalProps {
  preview: ImpactPreview;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal shown when a structural change would affect multiple nodes.
 * Requires user confirmation before applying.
 */
export const ImpactPreviewModal: React.FC<ImpactPreviewModalProps> = ({
  preview,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-claw-surface border border-claw-border rounded-xl shadow-2xl w-full max-w-md mx-4 animate-fade-in-up">
        {/* Header */}
        <div className="px-5 py-4 border-b border-claw-border">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-claw-warning/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-claw-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </span>
            <h3 className="text-base font-semibold text-claw-text">
              影响范围预览
            </h3>
          </div>
          <p className="text-sm text-claw-muted mt-2">
            你的这个调整会影响以下内容：
          </p>
        </div>

        {/* Impact summary */}
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-claw-bg rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-semibold text-claw-text">
                {preview.affectedProjects}
              </div>
              <div className="text-[10px] text-claw-muted">项目时间线</div>
            </div>
            <div className="bg-claw-bg rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-semibold text-claw-text">
                {preview.affectedDepartments}
              </div>
              <div className="text-[10px] text-claw-muted">部门任务</div>
            </div>
            <div className="bg-claw-bg rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-semibold text-claw-text">
                {preview.affectedMilestones}
              </div>
              <div className="text-[10px] text-claw-muted">里程碑</div>
            </div>
          </div>

          {preview.details.length > 0 && (
            <div className="space-y-1.5">
              {preview.details.map((detail, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-claw-muted"
                >
                  <span className="mt-1 w-1 h-1 rounded-full bg-claw-muted shrink-0" />
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-claw-border flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-claw-border text-sm text-claw-muted hover:text-claw-text hover:border-claw-text/30 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-claw-primary text-white text-sm font-medium hover:bg-claw-primary/80 transition-colors"
          >
            确认修改
          </button>
        </div>
      </div>
    </div>
  );
};
