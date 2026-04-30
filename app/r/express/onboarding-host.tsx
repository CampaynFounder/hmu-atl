'use client';

// Tiny client wrapper that mounts the ad-funnel onboarding component and
// hands it the redirect target on completion. Kept separate from page.tsx
// so the page stays a server component (auth + profile lookup happen
// before any client JS).

import { useRouter } from 'next/navigation';
import { RiderAdFunnelOnboarding } from '@/components/onboarding/rider-ad-funnel-onboarding';

export function OnboardingHost() {
  const router = useRouter();

  return (
    <RiderAdFunnelOnboarding
      onComplete={(browseRoute) => {
        // firstTime=1 tells the browse client to prime the payment slide-in
        // on first driver tap. Hard navigation forces Clerk metadata refresh
        // so middleware/RSC sees the just-set profileType.
        const target = `${browseRoute}?firstTime=1`;
        if (typeof window !== 'undefined') {
          window.location.href = target;
        } else {
          router.replace(target);
        }
      }}
    />
  );
}
