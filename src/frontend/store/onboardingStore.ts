import { create } from 'zustand';
import type { OnboardingStep, VisionInput } from '@/types';

interface OnboardingState {
  /** Current step (1-5) */
  currentStep: OnboardingStep;
  /** Whether the onboarding is completed */
  isCompleted: boolean;
  /** Vision input from step 1 */
  vision: VisionInput;
  /** Is AI generating the map (step 2) */
  isGeneratingMap: boolean;
  /** Nodes awaiting confirmation in step 3 */
  pendingNodeIds: string[];
  /** Step 4 push status */
  pushStatus: 'idle' | 'pushing' | 'done';

  // ─── Actions ───
  setStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setVision: (vision: VisionInput) => void;
  setGeneratingMap: (v: boolean) => void;
  setPendingNodes: (ids: string[]) => void;
  removeConfirmedNode: (id: string) => void;
  setPushStatus: (status: 'idle' | 'pushing' | 'done') => void;
  completeOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 1,
  isCompleted: false,
  vision: { rawText: '' },
  isGeneratingMap: false,
  pendingNodeIds: [],
  pushStatus: 'idle',

  setStep: (step) => set({ currentStep: step }),

  nextStep: () =>
    set((s) => ({
      currentStep: Math.min(5, s.currentStep + 1) as OnboardingStep,
    })),

  prevStep: () =>
    set((s) => ({
      currentStep: Math.max(1, s.currentStep - 1) as OnboardingStep,
    })),

  setVision: (vision) => set({ vision }),

  setGeneratingMap: (v) => set({ isGeneratingMap: v }),

  setPendingNodes: (ids) => set({ pendingNodeIds: ids }),

  removeConfirmedNode: (id) =>
    set((s) => ({
      pendingNodeIds: s.pendingNodeIds.filter((n) => n !== id),
    })),

  setPushStatus: (status) => set({ pushStatus: status }),

  completeOnboarding: () => set({ isCompleted: true }),
}));
