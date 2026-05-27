import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sendSms } from '@/lib/sms/textbee';

type DeleteReason = 'wrong_user_type' | 'bad_actor' | 'duplicate' | 'other';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const search     = searchParams.get('search');
  const type       = searchParams.get('type');
  const status     = searchParams.get('status');
  const marketId   = searchParams.get('marketId');
  const visibility = searchParams.get('visibility');
  const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const offset     = (page - 1) * PAGE_SIZE;

  const visibilityBool: boolean | null =
    visibility === 'visible' ? true : visibility === 'hidden' ? false : null;

  try {
    const pattern = search ? `%${search}%` : null;

    // Single parameterised query — no more 8-branch combinatorial explosion.
    // NULL market_id = unassigned user (webhook resolved nothing); always shown
    // regardless of the market filter so new signups never disappear silently.
    const rows = await sql`
      SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
             COALESCE(u.completed_rides, 0) AS completed_rides,
             u.created_at,
             u.last_sign_in_at,
             u.sign_in_count,
             u.first_return_at,
             COALESCE(dp.display_name, dp.first_name) AS driver_name,
             COALESCE(dp.phone, u.phone) AS driver_phone,
             COALESCE(rp.display_name, rp.first_name) AS rider_name,
             rp.handle AS rider_handle,
             COALESCE(dp.stripe_onboarding_complete, false) AS stripe_onboarding_complete,
             EXISTS(SELECT 1 FROM rider_payment_methods rpm WHERE rpm.rider_id = u.id) AS has_payment_method,
             CASE u.profile_type
               WHEN 'driver' THEN COALESCE(dp.profile_visible, true)
               WHEN 'rider'  THEN COALESCE(rp.profile_visible, true)
               ELSE NULL
             END AS profile_visible,
             COUNT(*) OVER() AS total_count
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles  rp ON rp.user_id  = u.id
      WHERE
        -- type filter
        (${type}::text IS NULL OR u.profile_type = ${type})
        -- status filter
        AND (${status}::text IS NULL OR u.account_status = ${status})
        -- market filter: compare as text to safely handle the sentinel "unassigned"
        AND (
          ${marketId}::text IS NULL
          OR (${marketId} = 'unassigned' AND u.market_id IS NULL)
          OR u.market_id::text = ${marketId}
        )
        -- search: name, handle, phone, clerk_id
        AND (${pattern}::text IS NULL
             OR dp.display_name ILIKE ${pattern} OR dp.first_name ILIKE ${pattern}
             OR rp.display_name ILIKE ${pattern} OR rp.first_name ILIKE ${pattern}
             OR rp.handle ILIKE ${pattern}
             OR dp.phone ILIKE ${pattern}
             OR u.clerk_id ILIKE ${pattern})
        -- visibility filter (drivers only)
        AND (${visibilityBool}::boolean IS NULL
             OR (u.profile_type = 'driver' AND COALESCE(dp.profile_visible, true) = ${visibilityBool})
             OR (u.profile_type = 'rider'  AND COALESCE(rp.profile_visible,  true) = ${visibilityBool}))
      ORDER BY u.created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;

    const total = rows.length > 0 ? Number((rows[0] as Record<string, unknown>).total_count ?? 0) : 0;

    const users = rows.map((r: Record<string, unknown>) => {
      const isDriverLike = r.profile_type === 'driver' || r.profile_type === 'both';
      const isRiderLike  = r.profile_type === 'rider'  || r.profile_type === 'both';
      const paymentReady =
        (isDriverLike && Boolean(r.stripe_onboarding_complete)) ||
        (isRiderLike  && Boolean(r.has_payment_method));
      return {
        id:            r.id,
        clerkId:       r.clerk_id,
        profileType:   r.profile_type,
        accountStatus: r.account_status,
        tier:          r.tier,
        displayName:   (r.driver_name || r.rider_name || r.rider_handle || 'No name') as string,
        phone:         r.driver_phone || null,
        completedRides: Number(r.completed_rides ?? 0),
        disputeCount:  0,
        createdAt:     r.created_at,
        lastSignInAt:  r.last_sign_in_at ?? null,
        signInCount:   Number(r.sign_in_count ?? 0),
        firstReturnAt: r.first_return_at ?? null,
        profileVisible: r.profile_visible ?? null,
        paymentReady,
      };
    });

    return NextResponse.json({ users, page, total, pageSize: PAGE_SIZE });
  } catch (error) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { userId, action } = await req.json();
  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action required' }, { status: 400 });
  }

  const statusMap: Record<string, string> = {
    suspend:  'suspended',
    activate: 'active',
    ban:      'suspended',
  };

  const newStatus = statusMap[action];
  if (!newStatus) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const rows = await sql`
    UPDATE users SET account_status = ${newStatus}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, clerk_id, account_status
  `;

  if (!rows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  try {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(rows[0].clerk_id as string, {
      publicMetadata: { accountStatus: newStatus },
    });
  } catch { /* Non-critical */ }

  return NextResponse.json({ success: true, userId, status: newStatus });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });

  try {
    const { userId, clerkId: inputClerkId, reason, smsMessage } = await req.json() as {
      userId?: string;
      clerkId?: string;
      reason?: DeleteReason;
      smsMessage?: string;
    };

    if (!userId && !inputClerkId) {
      return NextResponse.json({ error: 'userId or clerkId required' }, { status: 400 });
    }

    const userRows = await sql`
      SELECT u.id, u.clerk_id, u.profile_type,
             dp.phone AS driver_phone,
             rp.phone AS rider_phone
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles  rp ON rp.user_id  = u.id
      WHERE ${userId ? sql`u.id = ${userId}` : sql`u.clerk_id = ${inputClerkId}`}
      LIMIT 1
    `;

    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const user    = userRows[0];
    const neonId  = user.id as string;
    const clerkId = user.clerk_id as string;
    const phone   = (user.driver_phone || user.rider_phone) as string | null;

    // Block delete if any ride record exists (as rider or driver)
    const rideCheck = await sql`
      SELECT 1 FROM rides
      WHERE rider_id = ${neonId} OR driver_id = ${neonId}
      LIMIT 1
    `;
    if (rideCheck.length > 0) {
      return NextResponse.json({ error: 'Cannot delete — user has ride history' }, { status: 409 });
    }

    // Send SMS before deleting while the user record still exists
    let smsSent = false;
    if (reason === 'wrong_user_type' && smsMessage && phone) {
      const result = await sendSms(phone, smsMessage, { userId: neonId, eventType: 'admin_hard_delete_redirect' });
      smsSent = result.success;
    }

    // Pre-delete user-owned rows that lack ON DELETE CASCADE.
    // The migration 2026-05-25-user-delete-fk-cleanup.sql adds CASCADE to
    // these, but this explicit cleanup ensures the delete works even if the
    // migration hasn't run yet or a new table is added without cascade.
    await sql`DELETE FROM search_events WHERE user_id = ${neonId}`;
    await sql`DELETE FROM rider_payment_methods WHERE rider_id = ${neonId}`;
    await sql`DELETE FROM subscription_events WHERE user_id = ${neonId}`;

    try {
      await sql`DELETE FROM users WHERE id = ${neonId}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[hard-delete] Neon delete failed:', msg);
      return NextResponse.json({ error: `Database delete failed: ${msg}` }, { status: 500 });
    }

    try {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(clerkId);
    } catch { /* May already be deleted from Clerk */ }

    logAdminAction(admin.id, 'hard_delete_user', 'user', neonId, {
      reason: reason ?? 'unspecified', smsSent, clerkId,
    }).catch(() => {});

    return NextResponse.json({ success: true, deleted: { neonId, clerkId }, smsSent });
  } catch (err) {
    console.error('[hard-delete] Unhandled error:', err);
    return NextResponse.json({ error: 'Unexpected error during delete' }, { status: 500 });
  }
}
