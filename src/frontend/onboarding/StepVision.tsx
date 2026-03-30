import React, { useState } from 'react';
import { useOnboardingStore } from '@/store';

export const StepVision: React.FC = () => {
  const { vision, setVision, nextStep } = useOnboardingStore();
  const [text, setText] = useState(vision.rawText);

  const handleNext = () => {
    if (!text.trim()) return;
    setVision({ rawText: text.trim() });
    nextStep();
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h2 className="text-xl font-semibold text-claw-text">
          告诉我你的愿景
        </h2>
        <p className="text-sm text-claw-muted mt-2 leading-relaxed">
          用自然语言描述你的公司/团队要做什么。不用在意格式，自由表达就好。
          AI 会帮你把它结构化为可执行的计划。
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-claw-muted font-medium uppercase tracking-wider">
          愿景描述
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例如：我们要做一个面向中小企业的智能财务管理 SaaS，第一阶段先做自动记账和报表..."
          rows={8}
          className="w-full bg-claw-bg border border-claw-border rounded-lg px-4 py-3 text-sm text-claw-text placeholder-claw-muted/60 resize-none outline-none focus:border-claw-primary focus:ring-1 focus:ring-claw-primary/30 transition-colors leading-relaxed"
        />
        <p className="text-[10px] text-claw-muted">
          建议包含：公司目标、当前阶段重点、主要产品方向、团队构成
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={!text.trim()}
          className="px-6 py-2.5 rounded-lg bg-claw-primary text-white text-sm font-medium hover:bg-claw-primary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          下一步: AI 生成地图
        </button>
      </div>
    </div>
  );
};
