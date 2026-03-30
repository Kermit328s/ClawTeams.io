import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layout/MainLayout';
import { OnboardingWizard } from './onboarding/OnboardingWizard';
import { SettingsPage } from './layout/SettingsPage';
import { useOnboardingStore } from './store';

export const App: React.FC = () => {
  const { isCompleted } = useOnboardingStore();

  return (
    <Routes>
      {/* Main workspace — chat + map side by side */}
      <Route path="/" element={<MainLayout />} />

      {/* Onboarding wizard */}
      <Route path="/onboarding" element={<OnboardingWizard />} />

      {/* Settings */}
      <Route path="/settings" element={<SettingsPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
