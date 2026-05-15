// Stream C — driver-facing offer page (SMS deep-link target + feed click target).
// Per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-1 + §6.6: full ride details + three
// CTAs (HMU at $X / Counter ±counter_offer_max_pct / Pass) with Stripe Connect
// approval gate via DriverPayoutGate when 402 returned by Stream B.
//
// The shortcode resolution is delegated to Stream B's GET /api/blast/[shortcode]
// (PR #97). This server component just authenticates the driver, then hands off.

import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { DriverOfferClient } from './driver-offer-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ shortcode: string }>;
  searchParams: Promise<{ src?: string }>;
}

export default async function DriverOfferPage({ params, searchParams }: PageProps) {
  const { shortcode } = await params;
  const { src } = await searchParams;

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(`/d/b/${shortcode}${src ? `?src=${src}` : ''}`)}`);
  }

  const rows = await sql`
    SELECT u.id, u.profile_type,
           dp.stripe_account_id, dp.stripe_onboarding_complete,
           u.account_status
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  if (!rows.length) redirect('/onboarding?type=driver');
  const me = rows[0] as {
    id: string;
    profile_type: string;
    stripe_account_id: string | null;
    stripe_onboarding_complete: boolean | null;
    account_status: string | null;
  };
  if (me.profile_type !== 'driver') redirect('/');

  const stripeReady = !!(
    me.stripe_account_id &&
    me.stripe_onboarding_complete &&
    me.account_status === 'active'
  );

  return (
    <DriverOfferClient
      shortcode={shortcode}
      driverId={me.id}
      stripeReady={stripeReady}
      source={src === 'sms' || src === 'feed' || src === 'push' ? src : undefined}
    />
  );
}
