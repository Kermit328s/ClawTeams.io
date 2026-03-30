import React from 'react';
import { useOnboardingStore } from '@/store';
import { StepVision } from './StepVision';
import { StepGenerateMap } from './StepGenerateMap';
import { StepReviewMap } from './StepReviewMap';
import { StepPushDown } from './StepPushDown';
import { StepLaunch } from './StepLaunch';
import { StepIndicator } from './StepIndicator';

const steps = [
  { num: 1 as const, title: '愿景输入', desc: '告诉我你的想法' },
  { num: 2 as const, title: 'AI 生成地图', desc: '自动推导目标和计划' },
  { num: 3 as const, title: '确认调整', desc: '在地图上做判断' },
  { num: 4 as const, title: '向下传递', desc: '推送给负责人' },
  { num: 5 as const, title: '启动执行', desc: '龙虾开始工作' },
];

export const OnboardingWizard: React.FC = () => {
  const { currentStep } = useOnboardingStore();

  return (
    <div className="min-h-screen bg-claw-bg flex flex-col">
      {/* Header */}
      <div className="border-b border-claw-border px-6 py-4">
        <h1 className="text-lg font-semibold text-claw-text">
          ClawTeams 引导设置
        </h1>
        <p className="text-sm text-claw-muted mt-1">
          几分钟内让你的团队意图可视化、可执行
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator steps={steps} currentStep={currentStep} />

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-6 py-8">
        <div className="w-full max-w-3xl">
          {currentStep === 1 && <StepVision />}
          {currentStep === 2 && <StepGenerateMap />}
          {currentStep === 3 && <StepReviewMap />}
          {currentStep === 4 && <StepPushDown />}
          {currentStep === 5 && <StepLaunch />}
        </div>
      </div>
    </div>
  );
};
