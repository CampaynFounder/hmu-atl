'use client';

import { useState } from 'react';
import { RiderOnboarding } from '@/components/onboarding/rider-onboarding';

export default function OnboardingDemoPage() {
  const [completed, setCompleted] = useState(false);

  const handleComplete = () => {
    setCompleted(true);
    alert('Onboarding completed! (Demo mode)');
    // In production, would redirect to rider feed
    window.location.href = '/rider';
  };

  return (
    <div className="h-screen w-screen overflow-auto">
      <RiderOnboarding onComplete={handleComplete} />
    </div>
  );
}
