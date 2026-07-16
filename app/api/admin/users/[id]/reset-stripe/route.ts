// POST /api/admin/users/[id]/reset-stripe
//
// Clears a driver's Stripe Connect connection so they can relink from scratch.
// When a driver abandons Stripe onboarding, driver_profiles.stripe_account_id
// stays set-but-incomplete, and every retry re-links the SAME half-finished
// account (the onboarding-link route only creates a new account when the id is
// NULL) — the mobile app then spins waiting for a completion that never comes.
// Nulling the pointer + payout flags forces a fresh account on the next attempt.
//
// Best-effort deletes the abandoned account in Stripe too (an incomplete
// account has no balance, so this normally succeeds); a Stripe failure never
// blocks the local reset. Super admin only.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { clerkClient } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe/connect';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });

  const { id } = await params;

  try {
    const rows = await sql`
      SELECT dp.stripe_account_id, u.clerk_id
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.user_id = ${id}
      LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }
    const { stripe_account_id: stripeAccountId, clerk_id: clerkId } = rows[0] as {
      stripe_account_id: string | null;
      clerk_id: string;
    };

    // Best-effort delete of the abandoned Connect account. Never fatal — if it's
    // already gone or can't be deleted, we still clear the local pointer.
    let stripeDeleted = false;
    let stripeError: string | null = null;
    if (stripeAccountId) {
      try {
        await stripe.accounts.del(stripeAccountId);
        stripeDeleted = true;
      } catch (err) {
        stripeError = err instanceof Error ? err.message : String(err);
        console.error('[reset-stripe] Stripe account delete failed:', stripeError);
      }
    }

    // Clear the local Connect pointer + payout state. Nulling stripe_account_id
    // is what lets the driver create a brand-new account on their next attempt.
    await sql`
      UPDATE driver_profiles SET
        stripe_account_id             = NULL,
        stripe_onboarding_complete    = FALSE,
        stripe_external_account_last4 = NULL,
        stripe_external_account_type  = NULL,
        stripe_external_account_bank  = NULL,
        stripe_instant_eligible       = FALSE,
        payout_method                 = NULL,
        payout_setup_complete         = FALSE,
        updated_at                    = NOW()
      WHERE user_id = ${id}
    `;

    // The onboarding routes mirror the account id onto Clerk publicMetadata.
    // Nothing reads it for gating (the guards read the DB), but clear it so the
    // Clerk dashboard doesn't show a stale acct_ id. Non-fatal.
    try {
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(clerkId, { publicMetadata: { stripeAccountId: null } });
    } catch { /* non-critical */ }

    logAdminAction(admin.id, 'reset_stripe_connect', 'driver', id, {
      previousStripeAccountId: stripeAccountId,
      stripeDeleted,
      stripeError,
    }).catch(() => {});

    return NextResponse.json({ success: true, previousStripeAccountId: stripeAccountId, stripeDeleted, stripeError });
  } catch (err) {
    console.error('[reset-stripe] Unhandled error:', err);
    return NextResponse.json({ error: 'Unexpected error during reset' }, { status: 500 });
  }
}
