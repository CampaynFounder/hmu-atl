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

  // For a returning rider with a parked /rider/browse draft: gate on payment
  // method on file. PM exists → submit the booking now and route to the
  // confirmation screen. PM missing → bounce them through /onboarding in
  // express-payment-only mode so the same surface that captures cards for
  // brand-new riders also captures them for legacy accounts. Returns the
  // path to redirect to.
  const handleDraftForExistingRider = async (draftId: string, handle: string): Promise<string | null> => {
    try {
      // Check PM status. Treat any non-2xx as "no PM" — better to over-route
      // through the PM gate than to charge a setup intent we can't capture.
      let hasPm = false;
      try {
        const pmRes = await fetch('/api/rider/payment-methods', { cache: 'no-store' });
        if (pmRes.ok) {
          const pmData = await pmRes.json();
          hasPm = Array.isArray(pmData?.methods) && pmData.methods.length > 0;
        }
      } catch { /* treat as no PM */ }

      if (!hasPm) {
        // Single PM surface: ExpressRiderOnboarding in payment-only mode is
        // rendered by /onboarding when ?draft is present. We add &mode=express
        // for clarity even though the draft itself is what triggers express.
        // paymentOnly=1 tells the express component to skip name + media —
        // those were already captured in the rider's original signup.
        const params = new URLSearchParams({
          type: 'rider', mode: 'express', draft: draftId, handle, paymentOnly: '1',
        });
        return `/onboarding?${params}`;
      }

      // PM on file — submit the booking and route to the confirmation screen.
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
        const bookData = await bookRes.json().catch(() => ({} as Record<string, unknown>));
        // Mark consumed — single-use even if URL leaks.
        fetch(`/api/public/draft-booking/${draftId}`, { method: 'POST' }).catch(() => {});
        const postId = (bookData.postId as string | undefined) || '';
        return postId
          ? `/rider/booking-sent/${submitHandle}?postId=${postId}`
          : `/rider/booking-sent/${submitHandle}`;
      }
      // Booking failed (driver unavailable, conflict, etc) — drop them on
      // /rider/browse with a flag so the page can show the right error.
      const errData = await bookRes.json().catch(() => ({}));
      console.warn('[auth-callback] booking submit failed', errData);
      return `/rider/browse?bookingFailed=1`;
    } catch (e) {
      console.error('[auth-callback] draft handling threw', e);
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

    // Read draft params before blast detection so we can distinguish a real
    // browse-booking UUID from the blast sentinel string 'blast'.
    const draftFromMeta = (user?.unsafeMetadata?.draft_booking_id as string | undefined) || '';
    const handleFromMeta = (user?.unsafeMetadata?.draft_booking_handle as string | undefined) || '';
    const draftId = params.get('draft') || localStorage.getItem('hmu_signup_draft') || draftFromMeta || '';
    const draftHandle = params.get('handle') || localStorage.getItem('hmu_signup_handle') || handleFromMeta || '';
    // Blast server-side draft ID — present when user came from in-app browser and
    // switched to a real browser. Falls back to Clerk unsafeMetadata (survives OAuth).
    const blastDraftId = params.get('blastDraftId')
      || (user?.unsafeMetadata?.blast_draft_id as string | undefined)
      || '';

    // A real browse-booking draft has a non-sentinel UUID draftId and a driver handle.
    // When present, suppress blast routing so a stale hmu.blast.draft left in
    // localStorage from an abandoned blast session can't hijack this booking flow.
    const isBrowseDraft = !!(draftId && draftHandle && draftId !== 'blast');

    // Blast funnel detection. saveBlastDraft writes 'hmu.blast.draft' before the
    // auth round-trip; returnTo=/auth-callback/blast is now also forwarded as a
    // URL param by sign-up and sign-in (independent of localStorage). Both signals
    // are ignored when a live browse draft is present.
    let hasBlastDraft = false;
    try { hasBlastDraft = !!window.localStorage.getItem('hmu.blast.draft'); } catch { /* private mode */ }
    const cameFromBlast = !isBrowseDraft && (
      hasBlastDraft || (typeof returnTo === 'string' && returnTo.startsWith('/auth-callback/blast'))
    );

    // Clean up localStorage after reading — one-time use
    localStorage.removeItem('hmu_signup_type');
    localStorage.removeItem('hmu_signup_returnTo');
    localStorage.removeItem('hmu_signup_cash');
    localStorage.removeItem('hmu_signup_mode');
    localStorage.removeItem('hmu_signup_draft');
    localStorage.removeItem('hmu_signup_handle');

    // Fetch onboarding status before blast routing so the authoritative DB value
    // (hasRiderProfile) is available. publicMetadata.profileType can be stamped by
    // the Clerk webhook before the rider_profiles row is written, which would route
    // a brand-new blast signup to mode=signin (auto-send with no profile row),
    // causing the blast photo gate to fail.
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

    // Blast funnel routing takes priority over the standard onboarding flow.
    // Use data.hasRiderProfile (DB truth) to gate signin vs signup mode — NOT
    // publicMetadata.profileType, which the webhook can set before the DB row exists.
    if (cameFromBlast) {
      const isDriver = data?.profileType === 'driver'
        || (!data && user?.publicMetadata?.profileType === 'driver');
      if (isDriver) {
        try { localStorage.removeItem('hmu.blast.draft'); } catch { /* private mode */ }
        router.replace('/driver/home');
        return;
      }
      // Use DB hasRiderProfile as the authoritative existing-rider signal.
      // Fall back to Clerk metadata only when the API call itself failed.
      const hasRiderProfile = data != null
        ? !!data.hasRiderProfile
        : user?.publicMetadata?.profileType === 'rider';
      const blastCallbackParams = new URLSearchParams({
        mode: hasRiderProfile ? 'signin' : 'signup',
      });
      if (blastDraftId) blastCallbackParams.set('blastDraftId', blastDraftId);
      router.replace(`/auth-callback/blast?${blastCallbackParams}`);
      return;
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
      // Booking-funnel: existing rider with a parked draft → either submit
      // it now (PM on file) or route through the PM gate (no PM). The single
      // surface for the PM gate is /onboarding rendering ExpressRiderOnboarding
      // in payment-only mode.
      if (draftId && draftHandle && data.profileType === 'rider') {
        const target = await handleDraftForExistingRider(draftId, draftHandle);
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
      // New rider with a parked browse-draft → render ExpressRiderOnboarding
      // (name → media → PM → submit booking → /rider/booking-sent). The draft
      // pointer rides on the URL only; ExpressRiderOnboarding consumes it
      // directly on payment-success, so we don't need a localStorage backstop.
      if (mode === 'express' || (draftId && draftHandle)) {
        onboardingParams.set('mode', 'express');
      }
      if (draftId && draftHandle) {
        onboardingParams.set('draft', draftId);
        onboardingParams.set('handle', draftHandle);
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
