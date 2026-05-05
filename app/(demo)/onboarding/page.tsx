'use client';

import { Suspense, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { RiderOnboarding } from '@/components/onboarding/rider-onboarding';
import { DriverOnboarding } from '@/components/onboarding/driver-onboarding';
import { ExpressRiderOnboarding } from '@/components/onboarding/express-rider-onboarding';
import { DriverOnboardingExpress } from '@/components/onboarding/driver-onboarding-express';
import { ProfileTypeSelector } from '@/components/onboarding/profile-type-selector';

function OnboardingInner() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve profile type with explicit priority order:
  // 1. Clerk publicMetadata (set on return logins after first onboard)
  // 2. URL ?type= param (set from sign-up entry point)
  // 3. null → show selector
  const clerkProfileType = user?.publicMetadata?.profileType as string | undefined;
  const urlType = searchParams.get('type');
  const resolvedType = clerkProfileType || urlType || null;

  // Local state used only when resolvedType is null (ambiguous entry)
  const [selectedType, setSelectedType] = useState<'rider' | 'driver' | null>(null);

  const activeType = (resolvedType || selectedType) as 'rider' | 'driver' | null;
  const tier = (user?.publicMetadata?.tier as string | undefined) ?? 'free';

  // Detect chat booking flow: returnTo starts with /d/ (coming from driver share page)
  const returnTo = searchParams.get('returnTo');
  const isFromChatBooking = !!(returnTo && returnTo.startsWith('/d/'));
  const isCashRide = searchParams.get('cash') === '1';
  // Express driver mode is sticky: URL param wins, then Clerk unsafeMetadata
  // (set at sign-up time from /driver/express). We accept either.
  const urlMode = searchParams.get('mode');
  const clerkMode = (user?.unsafeMetadata as Record<string, unknown> | undefined)?.onboardingMode as string | undefined;
  const isExpressDriver = (urlMode === 'express' || clerkMode === 'express');

  // /rider/browse anon-booking funnel — a public_draft_bookings row is pinned
  // to this onboarding session. Express handles name → media → PM → booking
  // submit → confirmation route. Rider-only.
  // paymentOnly is set by auth-callback for existing riders with no PM, so
  // they skip name + media (already captured at original signup) and just
  // see the card form before the booking goes out.
  const draftId = searchParams.get('draft');
  const draftHandle = searchParams.get('handle');
  const hasBrowseDraft = !!(draftId && draftHandle);
  const isPaymentOnly = searchParams.get('paymentOnly') === '1';

  const handleComplete = (result?: { postId?: string; handle?: string }) => {
    // Full page reload to force Clerk to re-fetch user metadata
    // (client-side router.push keeps stale publicMetadata cache)
    const returnTo = searchParams.get('returnTo');
    // Browse draft submitted successfully → straight to the booking-sent
    // confirmation. ExpressRiderOnboarding hands back postId + handle.
    if (result?.postId && result?.handle) {
      const params = new URLSearchParams({ postId: result.postId });
      window.location.href = `/rider/booking-sent/${result.handle}?${params}`;
      return;
    }
    if (returnTo && returnTo.startsWith('/d/')) {
      // Rider signed up from a driver's HMU link — send them back with booking open
      const url = returnTo.includes('bookingOpen') ? returnTo : `${returnTo}?bookingOpen=1`;
      window.location.href = url;
    } else if (activeType === 'driver') {
      // New drivers land on their profile page to set ride prices, share their
      // HMU link, and configure their availability. /driver/home only makes
      // sense once they've done that setup.
      window.location.href = '/driver/profile';
    } else {
      window.location.href = '/rider/home';
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
        {isExpressDriver ? (
          <DriverOnboardingExpress onComplete={handleComplete} tier={tier} />
        ) : (
          <DriverOnboarding onComplete={handleComplete} tier={tier} />
        )}
      </div>
    );
  }

  // Express onboarding for riders coming from chat booking OR browse draft —
  // minimal fields. Browse draft additionally requires PM (no skip), and the
  // payment-success handler submits the parked booking before completing.
  if ((isFromChatBooking || hasBrowseDraft) && activeType === 'rider') {
    return (
      <ExpressRiderOnboarding
        onComplete={handleComplete}
        isCash={hasBrowseDraft ? false : isCashRide}
        publicDraftId={hasBrowseDraft ? draftId! : undefined}
        driverHandle={hasBrowseDraft ? draftHandle! : undefined}
        paymentOnly={hasBrowseDraft && isPaymentOnly}
      />
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
