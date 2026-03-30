import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore } from '../../src/frontend/store/onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      currentStep: 1,
      isCompleted: false,
      vision: { rawText: '' },
      isGeneratingMap: false,
      pendingNodeIds: [],
      pushStatus: 'idle',
    });
  });

  it('should start at step 1', () => {
    expect(useOnboardingStore.getState().currentStep).toBe(1);
  });

  it('should advance to next step', () => {
    useOnboardingStore.getState().nextStep();
    expect(useOnboardingStore.getState().currentStep).toBe(2);
  });

  it('should not exceed step 5', () => {
    useOnboardingStore.setState({ currentStep: 5 });
    useOnboardingStore.getState().nextStep();
    expect(useOnboardingStore.getState().currentStep).toBe(5);
  });

  it('should go to previous step', () => {
    useOnboardingStore.setState({ currentStep: 3 });
    useOnboardingStore.getState().prevStep();
    expect(useOnboardingStore.getState().currentStep).toBe(2);
  });

  it('should not go below step 1', () => {
    useOnboardingStore.getState().prevStep();
    expect(useOnboardingStore.getState().currentStep).toBe(1);
  });

  it('should set vision', () => {
    useOnboardingStore.getState().setVision({
      rawText: 'Build a SaaS product',
    });
    expect(useOnboardingStore.getState().vision.rawText).toBe('Build a SaaS product');
  });

  it('should manage pending nodes', () => {
    useOnboardingStore.getState().setPendingNodes(['n1', 'n2', 'n3']);
    expect(useOnboardingStore.getState().pendingNodeIds).toHaveLength(3);

    useOnboardingStore.getState().removeConfirmedNode('n2');
    expect(useOnboardingStore.getState().pendingNodeIds).toEqual(['n1', 'n3']);
  });

  it('should complete onboarding', () => {
    useOnboardingStore.getState().completeOnboarding();
    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });

  it('should set push status', () => {
    useOnboardingStore.getState().setPushStatus('pushing');
    expect(useOnboardingStore.getState().pushStatus).toBe('pushing');
    useOnboardingStore.getState().setPushStatus('done');
    expect(useOnboardingStore.getState().pushStatus).toBe('done');
  });
});
