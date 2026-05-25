// DEPRECATED: This endpoint redirected to Stripe Express Dashboard (hosted page).
// Violates the in-app-only policy per CLAUDE.md STRIPE INTEGRATION section.
// Use /driver/payout-setup page instead, which renders the embedded StripeEmbedded
// component (app/driver/payout-setup/stripe-embedded.tsx) with ConnectAccountOnboarding.
//
// Per CLAUDE.md:
// "Live leaks (do NOT add new callers — Phase B will rip these out):
//  - app/api/driver/payout-setup/update/route.ts — both branches redirect off-app.
//    Replace with /driver/payout-setup redirect (already renders the embedded view)."

import { NextResponse } from 'next/server';

export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';

  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Use /driver/payout-setup page (embedded Stripe components).',
      redirectTo: `${appUrl}/driver/payout-setup`,
    },
    { status: 410 } // 410 Gone
  );
}
