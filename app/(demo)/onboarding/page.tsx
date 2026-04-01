'use client';

import { Suspense, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { RiderOnboarding } from '@/components/onboarding/rider-onboarding';
import { DriverOnboarding } from '@/components/onboarding/driver-onboarding';
import { ProfileTypeSelector } from '@/components/onboarding/profile-type-selector';

function OnboardingInner() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve profile type with explicit priority order:
  // 1. URL ?type= param when returnTo is a driver link (booking as rider — override Clerk)
  // 2. Clerk publicMetadata (set on return logins after first onboard)
  // 3. URL ?type= param (set from sign-up entry point)
  // 4. null → show selector
  const clerkProfileType = user?.publicMetadata?.profileType as string | undefined;
  const urlType = searchParams.get('type');
  const returnTo = searchParams.get('returnTo');
  const isBookingAsRider = returnTo?.startsWith('/d/') && urlType === 'rider';
  const resolvedType = isBookingAsRider ? 'rider' : (clerkProfileType || urlType || null);

  // Local state used only when resolvedType is null (ambiguous entry)
  const [selectedType, setSelectedType] = useState<'rider' | 'driver' | null>(null);

  const activeType = (resolvedType || selectedType) as 'rider' | 'driver' | null;
  const tier = (user?.publicMetadata?.tier as string | undefined) ?? 'free';

  const handleComplete = () => {
    // Full page reload to force Clerk to re-fetch user metadata
    // (client-side router.push keeps stale publicMetadata cache)
    const returnTo = searchParams.get('returnTo');
    if (returnTo && returnTo.startsWith('/d/')) {
      // Rider signed up from a driver's HMU link — send them back with booking open
      const url = returnTo.includes('bookingOpen') ? returnTo : `${returnTo}?bookingOpen=1`;
      window.location.href = url;
    } else {
      window.location.href = activeType === 'driver' ? '/driver/home' : '/rider/home';
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00E676] border-t-transparent" />
      </div>
    );
  }

  // No type determined from Clerk or URL — show the selector first
  if (!activeType) {
    return <ProfileTypeSelector onSelect={setSelectedType} />;
  }

  if (activeType === 'driver') {
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

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00E676] border-t-transparent" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  );
}
