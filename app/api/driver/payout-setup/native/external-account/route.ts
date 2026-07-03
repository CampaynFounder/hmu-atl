// POST /api/driver/payout-setup/native/external-account — Option B step 3.
// Attaches the driver's payout method (bank account or debit card) to their
// Custom account. The raw bank/card details are tokenized CLIENT-SIDE by the
// Stripe SDK — we only ever receive the resulting token (btok_… / tok_…), never
// the account/routing/card numbers. Gated OFF by driver_payout_native_forms.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { attachExternalAccount, getAccountRequirements } from '@/lib/stripe/connect';
import { requireNativePayoutDriver } from '@/lib/stripe/native-payout-guard';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const g = await requireNativePayoutDriver();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.stripeAccountId) return NextResponse.json({ error: 'No account — call /native/account first' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!/^(btok_|tok_)/.test(token)) {
    return NextResponse.json({ error: 'A valid Stripe token is required' }, { status: 400 });
  }

  try {
    const ext = await attachExternalAccount(g.stripeAccountId, token);
    const requirements = await getAccountRequirements(g.stripeAccountId);

    // Persist the display fields + completion, mirroring the embedded/hosted path
    // (app/api/driver/payout-setup keeps these in sync too).
    const complete = requirements.chargesEnabled && requirements.payoutsEnabled;
    await sql`
      UPDATE driver_profiles
         SET stripe_external_account_last4 = ${ext.last4},
             stripe_external_account_type  = ${ext.type},
             stripe_external_account_bank  = ${ext.bankName},
             stripe_instant_eligible       = ${ext.instantEligible},
             payout_method                 = ${ext.type === 'card' ? 'debit' : 'bank'},
             payout_setup_complete         = ${true},
             stripe_onboarding_complete    = ${complete}
       WHERE user_id = ${g.userId}
    `;

    return NextResponse.json({ ok: true, externalAccount: ext, requirements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not add payout method';
    console.error('[native/external-account]', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
