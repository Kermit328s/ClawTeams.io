import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStore } from '@/store';

/**
 * Step 5: Launch execution — lobsters start working.
 */
export const StepLaunch: React.FC = () => {
  const { completeOnboarding } = useOnboardingStore();
  const navigate = useNavigate();

  const handleLaunch = () => {
    completeOnboarding();
    navigate('/');
  };

  return (
    <div className="space-y-8 text-center animate-fade-in-up">
      <div className="pt-8">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-claw-success/10 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-claw-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-claw-text">
          一切就绪！
        </h2>
        <p className="text-sm text-claw-muted mt-3 max-w-md mx-auto leading-relaxed">
          你的意图地图已生成，任务已分配。
          龙虾将开始接收任务，适配层注入上下文，执行结果实时回写到地图上。
        </p>
      </div>

      <div className="space-y-3 max-w-sm mx-auto">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-claw-bg border border-claw-border text-left">
          <span className="w-6 h-6 rounded-full bg-claw-success/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-claw-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="text-sm text-claw-text">龙虾开始接收任务</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-claw-bg border border-claw-border text-left">
          <span className="w-6 h-6 rounded-full bg-claw-success/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-claw-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="text-sm text-claw-text">适配层注入上下文</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-claw-bg border border-claw-border text-left">
          <span className="w-6 h-6 rounded-full bg-claw-success/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-claw-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="text-sm text-claw-text">执行结果实时回写</span>
        </div>
      </div>

      <button
        onClick={handleLaunch}
        className="px-8 py-3 rounded-lg bg-claw-primary text-white text-sm font-semibold hover:bg-claw-primary/80 transition-colors"
      >
        进入主界面
      </button>
    </div>
  );
};
