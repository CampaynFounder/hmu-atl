// POST /api/users/delete — self-service account deletion (soft-delete).
//
// Marks the account for deletion: the row + all FK children (rides, payments,
// ratings) are RETAINED for safety/legal reasons, but the user loses all access
// and becomes invisible to everyone else. The Clerk user is deleted so the phone
// frees up and a fresh re-signup mints a brand-new users row (new Stripe
// customer/Connect, payment methods, ride history — no cross-pollination).
// Admins correlate old <-> new accounts by phone.

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { stripe } from '@/lib/stripe/connect';
import { softDeleteUser } from '@/lib/db/users';

export const runtime = 'nodejs';

async function deleteClerkUser(clerkId: string): Promise<void> {
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerkId);
  } catch (e) {
    // Non-fatal: the account is already soft-deleted in Neon, and the app-side
    // status gate blocks access regardless of Clerk state.
    console.error('[account-delete] Clerk deleteUser failed:', e);
  }
}

export async function POST(_request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = await checkRateLimit({ key: `account-delete:${clerkId}`, limit: 5, windowSeconds: 300 });
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  const rows = await sql`
    SELECT u.id, u.account_status, dp.stripe_subscription_id
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;

  // No Neon row yet (webhook never landed) — nothing to retain; just free the phone.
  if (!rows.length) {
    await deleteClerkUser(clerkId);
    return NextResponse.json({ ok: true });
  }

  const user = rows[0] as { id: string; account_status: string; stripe_subscription_id: string | null };

  // Idempotent: already deleted. Make sure the Clerk user is gone too.
  if (user.account_status === 'deleted') {
    await deleteClerkUser(clerkId);
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  // Block deletion during an in-flight ride — money may be in escrow and the
  // other party is mid-trip. 'ended' (settled, rating pending) does NOT block.
  const liveRide = await sql`
    SELECT 1 FROM rides
    WHERE (rider_id = ${user.id} OR driver_id = ${user.id})
      AND status IN ('pending', 'accepted', 'matched', 'otw', 'here', 'active', 'in_progress')
    LIMIT 1
  `;
  if (liveRide.length) {
    return NextResponse.json(
      { error: 'You have an active ride. Finish or cancel it before deleting your account.' },
      { status: 409 },
    );
  }

  // 1. Soft-delete the Neon row — authoritative "no access + invisible" flag.
  await softDeleteUser(clerkId, 'self');

  // 2. Best-effort cleanup — never gates the delete.
  // Cancel an active HMU First subscription so the card stops being charged.
  if (user.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(user.stripe_subscription_id);
    } catch (e) {
      console.error('[account-delete] HMU First sub cancel failed:', e);
    }
  }
  // Audit trail — surfaces in the admin user activity feed.
  await sql`
    INSERT INTO user_activity (user_id, event_name, properties, created_at)
    VALUES (${user.id}, 'account_deleted', ${JSON.stringify({ source: 'self' })}::jsonb, NOW())
  `.catch(() => {});

  // 3. Delete the Clerk user LAST — frees the phone for a fresh re-signup and
  // revokes all sessions. The user.deleted webhook is now a harmless no-op
  // (row already 'deleted').
  await deleteClerkUser(clerkId);

  return NextResponse.json({ ok: true });
}
