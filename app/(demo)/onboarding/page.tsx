'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { RiderOnboarding } from '@/components/onboarding/rider-onboarding';
import { DriverOnboarding } from '@/components/onboarding/driver-onboarding';

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const handleComplete = () => {
    const profileType = user?.publicMetadata?.profileType;
    router.push(profileType === 'driver' ? '/driver-demo' : '/rider');
  };

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00E676] border-t-transparent" />
      </div>
    );
  }

  const profileType = user?.publicMetadata?.profileType as string | undefined;
  const tier = (user?.publicMetadata?.tier as string | undefined) ?? 'free';

  if (profileType === 'driver') {
    return (
      <div className="h-screen w-screen overflow-auto">
        <DriverOnboarding onComplete={handleComplete} tier={tier} />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-auto">
      <RiderOnboarding onComplete={handleComplete} tier={tier} />
    </div>
  );
}
