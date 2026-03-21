'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';

/**
 * Post-authentication callback page
 * Checks user's onboarding status and routes them appropriately
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      // Not signed in, redirect to sign-in page
      router.replace('/sign-in');
      return;
    }

    // User is authenticated, check onboarding status
    checkOnboardingAndRedirect();
  }, [isLoaded, isSignedIn]);

  const checkOnboardingAndRedirect = async () => {
    try {
      const params = new URLSearchParams(window.location.search);

      // Read type from URL params first, fall back to localStorage (OAuth loses URL params)
      const type = params.get('type') || localStorage.getItem('hmu_signup_type');
      const returnTo = params.get('returnTo') || localStorage.getItem('hmu_signup_returnTo');

      // Clean up localStorage after reading — one-time use
      localStorage.removeItem('hmu_signup_type');
      localStorage.removeItem('hmu_signup_returnTo');

      const res = await fetch('/api/users/onboarding');
      const data = await res.json();

      // Route if onboarded (active or pending_activation with a profile created)
      const hasProfile = data.hasDriverProfile || data.hasRiderProfile;
      if (hasProfile) {
        // If rider came from a driver share link, send them back there
        if (returnTo && returnTo.startsWith('/d/')) {
          router.replace(`${returnTo}?bookingOpen=1`);
          return;
        }
        if (data.profileType === 'driver') {
          router.replace('/driver/home');
        } else if (data.profileType === 'rider' || data.profileType === 'both') {
          router.replace('/rider/home');
        } else {
          router.replace('/rider/home');
        }
      } else {
        // Forward type and returnTo through onboarding so context is never lost
        const onboardingParams = new URLSearchParams();
        if (type) onboardingParams.set('type', type);
        if (returnTo) onboardingParams.set('returnTo', returnTo);
        const onboardingUrl = `/onboarding${onboardingParams.size ? `?${onboardingParams}` : ''}`;
        router.replace(onboardingUrl);
      }
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
      router.replace('/onboarding');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-purple-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto" />
        <p className="text-lg text-muted-foreground">Setting up your account...</p>
      </div>
    </div>
  );
}
