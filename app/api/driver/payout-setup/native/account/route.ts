// POST /api/driver/payout-setup/native/account — Option B step 1.
// Ensures a Custom Connect account exists for the driver and records their
// in-app acceptance of Stripe's Connected Account Agreement (tos_acceptance).
// Only creates an account if the driver has none — existing accounts are left
// alone (the payoutMode gate keeps native mode to new drivers). Gated OFF by
// the driver_payout_native_forms flag.

import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { createCustomConnectAccount, getAccountRequirements } from '@/lib/stripe/connect';
import { requireNativePayoutDriver, clientIp } from '@/lib/stripe/native-payout-guard';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const g = await requireNativePayoutDriver();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  let stripeAccountId = g.stripeAccountId;
  try {
    if (!stripeAccountId) {
      const email = g.email
        || (g.phone ? `${g.phone.replace(/\D/g, '')}@phone.hmucashride.com` : `${g.clerkId}@driver.hmucashride.com`);
      stripeAccountId = await createCustomConnectAccount({
        email,
        firstName: g.firstName || '',
        lastName: g.lastName || '',
        ip: clientIp(req),
        phone: g.phone ?? undefined,
      });
      await sql`UPDATE driver_profiles SET stripe_account_id = ${stripeAccountId} WHERE user_id = ${g.userId}`;
      try {
        const clerk = await clerkClient();
        await clerk.users.updateUserMetadata(g.clerkId, { publicMetadata: { stripeAccountId } });
      } catch { /* non-fatal */ }
    }

    const requirements = await getAccountRequirements(stripeAccountId);
    return NextResponse.json({ stripeAccountId, requirements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create account';
    console.error('[native/account]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
