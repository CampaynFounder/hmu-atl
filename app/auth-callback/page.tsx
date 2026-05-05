'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';
import { fbEvent } from '@/components/analytics/meta-pixel';

/**
 * Post-authentication callback page
 * Checks user's onboarding status and routes them appropriately
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();

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

  // Consume a parked /rider/browse draft and submit it via the existing
  // direct-booking endpoint. Returns the path to redirect to. Falls back to
  // a soft toast on /rider/browse if the draft is missing/expired/invalid.
  const consumeDraftBooking = async (draftId: string, handle: string): Promise<string | null> => {
    try {
      const draftRes = await fetch(`/api/public/draft-booking/${draftId}`, { cache: 'no-store' });
      if (!draftRes.ok) {
        if (draftRes.status === 410) return '/rider/browse?draftExpired=1';
        return null;
      }
      const draft = await draftRes.json() as {
        handle: string;
        payload: { price: number; isCash: boolean; timeWindow: Record<string, unknown> };
      };
      // Belt-and-suspenders: only submit to the handle the draft was created
      // for, not whatever the caller pinned in the URL.
      const submitHandle = draft.handle || handle;
      const bookRes = await fetch(`/api/drivers/${submitHandle}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: draft.payload.price,
          is_cash: false,
          timeWindow: draft.payload.timeWindow,
        }),
      });
      if (bookRes.ok) {
        // Mark consumed — single-use even if URL leaks.
        fetch(`/api/public/draft-booking/${draftId}`, { method: 'POST' }).catch(() => {});
        return `/rider/home?bookingSent=${submitHandle}`;
      }
      // Booking failed (driver unavailable, conflict, etc) — drop them on
      // /rider/home with the error visible so they can try another driver.
      const errData = await bookRes.json().catch(() => ({}));
      console.warn('[auth-callback] booking submit failed', errData);
      return `/rider/home?bookingFailed=1`;
    } catch (e) {
      console.error('[auth-callback] draft consume threw', e);
      return null;
    }
  };

  const checkOnboardingAndRedirect = async () => {
    const params = new URLSearchParams(window.location.search);

    // Read type from URL params first, fall back to localStorage (OAuth loses URL params)
    const type = params.get('type') || localStorage.getItem('hmu_signup_type');
    const returnTo = params.get('returnTo') || localStorage.getItem('hmu_signup_returnTo');
    const isCash = params.get('cash') || localStorage.getItem('hmu_signup_cash');
    const mode = params.get('mode') || localStorage.getItem('hmu_signup_mode');
    // Booking funnel: /rider/browse → /sign-up → here. Both branches forward
    // the params, but OAuth round-trips can drop them, so localStorage and
    // the Clerk user's unsafeMetadata both back-stop.
    const draftFromMeta = (user?.unsafeMetadata?.draft_booking_id as string | undefined) || '';
    const handleFromMeta = (user?.unsafeMetadata?.draft_booking_handle as string | undefined) || '';
    const draftId = params.get('draft') || localStorage.getItem('hmu_signup_draft') || draftFromMeta || '';
    const draftHandle = params.get('handle') || localStorage.getItem('hmu_signup_handle') || handleFromMeta || '';

    // Clean up localStorage after reading — one-time use
    localStorage.removeItem('hmu_signup_type');
    localStorage.removeItem('hmu_signup_returnTo');
    localStorage.removeItem('hmu_signup_cash');
    localStorage.removeItem('hmu_signup_mode');
    localStorage.removeItem('hmu_signup_draft');
    localStorage.removeItem('hmu_signup_handle');

    // Retry the onboarding-status fetch once on transient failure. A single
    // Neon/Worker cold-start blip must NEVER drop an existing user onto
    // /onboarding — that was the bug silently pushing signed-in drivers
    // through the new-user flow.
    let data: {
      hasDriverProfile?: boolean;
      hasRiderProfile?: boolean;
      profileType?: string;
    } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/users/onboarding', { cache: 'no-store' });
        if (res.ok) {
          data = await res.json();
          break;
        }
        console.error('[auth-callback] onboarding status !ok', { attempt, status: res.status });
      } catch (err) {
        console.error('[auth-callback] onboarding status threw', { attempt, err });
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 400));
    }

    // On persistent API failure, route from the Clerk session's
    // publicMetadata.profileType — a signed-in driver/rider with a live
    // Clerk session must land on their home, not on marketing root and not
    // on /onboarding. Only fall back to /sign-in if we somehow have no
    // session info at all (should never happen past the isSignedIn gate).
    if (!data) {
      const metaType = user?.publicMetadata?.profileType as string | undefined;
      console.error('[auth-callback] onboarding status API unavailable; routing from Clerk metadata', { metaType });
      if (metaType === 'driver') { router.replace('/driver/home'); return; }
      if (metaType === 'rider')  { router.replace('/rider/home');  return; }
      if (metaType === 'admin')  { router.replace('/admin');       return; }
      // No profileType on Clerk — could be a genuinely new user whose
      // onboarding hasn't completed yet. Send them to onboarding so they
      // can finish; better than stranding them on marketing root.
      router.replace('/onboarding');
      return;
    }

    const hasProfile = data.hasDriverProfile || data.hasRiderProfile;
    if (hasProfile) {
      // Booking-funnel: existing rider had a draft parked → submit it now and
      // land them on home with confirmation context.
      if (draftId && draftHandle && data.profileType === 'rider') {
        const target = await consumeDraftBooking(draftId, draftHandle);
        if (target) { router.replace(target); return; }
      }
      // Rider ad-funnel landing — re-arriving riders go straight back to it,
      // and the page itself routes them on to /rider/browse.
      if (returnTo && returnTo.startsWith('/r/')) {
        router.replace(returnTo);
        return;
      }
      // If rider came from a driver share link, send them back
      if (returnTo && returnTo.startsWith('/d/')) {
        // Drivers can't book — send them to their dashboard
        if (data.profileType === 'driver') {
          router.replace('/driver/home');
          return;
        }
        const url = returnTo.includes('bookingOpen') ? returnTo : `${returnTo}?bookingOpen=1`;
        router.replace(url);
        return;
      }
      if (data.profileType === 'driver') {
        router.replace('/driver/home');
      } else {
        router.replace('/rider/home');
      }
    } else {
      // New user — fire CompleteRegistration pixel event
      fbEvent('CompleteRegistration', { content_name: type || 'unknown', content_category: type === 'driver' ? 'driver_funnel' : 'rider_funnel' });

      // Rider ad-funnel: skip /onboarding entirely — /r/express hosts its own
      // onboarding flow inline. Same /d/ pattern would route through onboarding,
      // but ad-funnel is intentionally a self-contained page.
      if (returnTo && returnTo.startsWith('/r/')) {
        router.replace(returnTo);
        return;
      }

      // Forward type and returnTo through onboarding so context is never lost
      const onboardingParams = new URLSearchParams();
      if (type) onboardingParams.set('type', type);
      if (returnTo) onboardingParams.set('returnTo', returnTo);
      if (isCash === '1') onboardingParams.set('cash', '1');
      if (mode === 'express') onboardingParams.set('mode', 'express');
      // New rider with a parked browse-draft. Forward through onboarding;
      // the post-onboarding handler reads these and submits the booking once
      // account_status flips to 'active'. Until then we re-park in localStorage
      // since onboarding may not preserve all query params end-to-end.
      if (draftId && draftHandle) {
        onboardingParams.set('draft', draftId);
        onboardingParams.set('handle', draftHandle);
        try {
          localStorage.setItem('hmu_pending_draft', draftId);
          localStorage.setItem('hmu_pending_draft_handle', draftHandle);
        } catch { /* ignore */ }
      }
      const onboardingUrl = `/onboarding${onboardingParams.size ? `?${onboardingParams}` : ''}`;
      router.replace(onboardingUrl);
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
