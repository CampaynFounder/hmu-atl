// /r/express — paid-ads landing for the rider funnel.
//
// Self-contained: renders the unauthed landing OR the onboarding flow OR
// redirects to /rider/browse depending on auth + profile state. This page
// is the link target in Meta/TikTok ad creative — short URL, single
// purpose, no tab-and-mode dispatching through /onboarding.
//
// The companion driver landing is /driver/express (different funnel).

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRiderProfileByUserId } from '@/lib/db/profiles';
import { LandingClient } from './landing-client';
import { OnboardingHost } from './onboarding-host';

export const metadata: Metadata = {
  title: 'HMU ATL — Real Atlanta drivers, fair prices.',
  description:
    'Skip Uber. Real local drivers, prices that make sense, payment held until the ride is done. Sign up in under a minute.',
};

export const dynamic = 'force-dynamic';

export default async function RiderExpressPage() {
  const { userId: clerkId } = await auth();

  // Unauthed → landing.
  if (!clerkId) {
    return <LandingClient />;
  }

  // Authed → check for an existing rider profile.
  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (userRows.length === 0) {
    // Brand-new user, webhook hasn't fired yet — drop into onboarding so
    // /api/users/onboarding's race fallback creates the user row.
    return <OnboardingHost />;
  }

  const riderProfile = await getRiderProfileByUserId(userRows[0].id as string);
  if (riderProfile) {
    // Returning rider hit the ad URL — straight to browse.
    redirect('/rider/browse?firstTime=0');
  }

  return <OnboardingHost />;
}
