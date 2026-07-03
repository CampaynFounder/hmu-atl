// GET /api/driver/payout-setup/native/status — Option B polling.
// Returns the Custom account's verification requirements so the native form can
// show progress + know when payouts are live. Gated OFF by the flag.

import { NextResponse } from 'next/server';
import { getAccountRequirements } from '@/lib/stripe/connect';
import { requireNativePayoutDriver } from '@/lib/stripe/native-payout-guard';

export const runtime = 'nodejs';

export async function GET() {
  const g = await requireNativePayoutDriver();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.stripeAccountId) {
    return NextResponse.json({ stripeAccountId: null, requirements: null });
  }
  try {
    const requirements = await getAccountRequirements(g.stripeAccountId);
    return NextResponse.json({ stripeAccountId: g.stripeAccountId, requirements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
