import React from 'react';
import clsx from 'clsx';
import type { OnboardingStep } from '@/types';

interface Step {
  num: OnboardingStep;
  title: string;
  desc: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: OnboardingStep;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  steps,
  currentStep,
}) => {
  return (
    <div className="px-6 py-4 border-b border-claw-border">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((step, i) => (
          <React.Fragment key={step.num}>
            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                  step.num < currentStep &&
                    'bg-claw-success text-white',
                  step.num === currentStep &&
                    'bg-claw-primary text-white',
                  step.num > currentStep &&
                    'bg-claw-border text-claw-muted',
                )}
              >
                {step.num < currentStep ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.num
                )}
              </div>
              <div className="hidden sm:block">
                <p
                  className={clsx(
                    'text-xs font-medium',
                    step.num === currentStep
                      ? 'text-claw-text'
                      : 'text-claw-muted',
                  )}
                >
                  {step.title}
                </p>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                className={clsx(
                  'flex-1 h-px mx-3',
                  step.num < currentStep
                    ? 'bg-claw-success'
                    : 'bg-claw-border',
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
