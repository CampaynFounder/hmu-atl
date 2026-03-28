// GET /api/admin/users/[id] — Full user profile for admin view
// PATCH /api/admin/users/[id] — Update user (status, tier, og_status, chill_score)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { clerkClient } from '@clerk/nextjs/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;

  const [userRows, rideRows, ratingRows, disputeRows] = await Promise.all([
    sql`
      SELECT
        u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
        u.og_status, u.chill_score, COALESCE(u.completed_rides, 0) as completed_rides,
        (SELECT COUNT(*) FROM disputes WHERE filed_by = u.id) as dispute_count,
        u.created_at, u.updated_at,
        dp.first_name as driver_first, dp.last_name as driver_last,
        dp.display_name as driver_display, dp.handle, dp.stripe_connect_id,
        dp.video_url, dp.areas as driver_areas, dp.vehicle_info, dp.phone as driver_phone,
        rp.first_name as rider_first, rp.last_name as rider_last,
        rp.display_name as rider_display, rp.stripe_customer_id
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.id = ${id}
      LIMIT 1
    `,
    sql`
      SELECT id, status, COALESCE(final_agreed_price, amount) as amount,
        COALESCE(platform_fee_amount, 0) as platform_fee,
        COALESCE(driver_payout_amount, 0) as driver_payout,
        created_at, driver_id, rider_id, pickup, dropoff
      FROM rides
      WHERE driver_id = ${id} OR rider_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `,
    sql`
      SELECT r.rating_type, r.created_at, r.ride_id,
        CASE WHEN r.rater_id = ${id} THEN 'given' ELSE 'received' END as direction,
        CASE WHEN r.rater_id = ${id} THEN r.rated_id ELSE r.rater_id END as other_user_id
      FROM ratings r
      WHERE r.rater_id = ${id} OR r.rated_id = ${id}
      ORDER BY r.created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT id, ride_id, status, reason, created_at
      FROM disputes
      WHERE filed_by = ${id}
         OR ride_id IN (SELECT id FROM rides WHERE driver_id = ${id} OR rider_id = ${id})
      ORDER BY created_at DESC
      LIMIT 10
    `,
  ]);

  if (!userRows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const u = userRows[0];

  return NextResponse.json({
    user: {
      id: u.id,
      clerkId: u.clerk_id,
      profileType: u.profile_type,
      accountStatus: u.account_status,
      tier: u.tier,
      ogStatus: u.og_status,
      chillScore: Number(u.chill_score ?? 0),
      completedRides: Number(u.completed_rides ?? 0),
      disputeCount: Number(u.dispute_count ?? 0),
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      displayName: u.driver_display || u.driver_first
        ? `${u.driver_display || u.driver_first || ''} ${u.driver_last || ''}`.trim()
        : u.rider_display || u.rider_first
          ? `${u.rider_display || u.rider_first || ''} ${u.rider_last || ''}`.trim()
          : 'No name',
      handle: u.handle,
      stripeConnectId: u.stripe_connect_id,
      stripeCustomerId: u.stripe_customer_id,
      videoUrl: u.video_url,
      driverAreas: u.driver_areas,
      vehicleInfo: u.vehicle_info,
      phone: u.driver_phone,
    },
    rides: rideRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      status: r.status,
      price: Number(r.amount ?? 0),
      platformFee: Number(r.platform_fee ?? 0),
      driverPayout: Number(r.driver_payout ?? 0),
      driverId: r.driver_id,
      riderId: r.rider_id,
      pickup: r.pickup,
      dropoff: r.dropoff,
      createdAt: r.created_at,
    })),
    ratings: ratingRows.map((r: Record<string, unknown>) => ({
      type: r.rating_type,
      direction: r.direction,
      otherUserId: r.other_user_id,
      rideId: r.ride_id,
      createdAt: r.created_at,
    })),
    disputes: disputeRows.map((d: Record<string, unknown>) => ({
      id: d.id,
      rideId: d.ride_id,
      status: d.status,
      reason: d.reason,
      createdAt: d.created_at,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json();
  const { accountStatus, tier, ogStatus, chillScore, adminNotes } = body;

  // Use COALESCE to only update provided fields
  const rows = await sql`
    UPDATE users SET
      account_status = COALESCE(${accountStatus ?? null}, account_status),
      tier = COALESCE(${tier ?? null}, tier),
      og_status = COALESCE(${ogStatus ?? null}, og_status),
      chill_score = COALESCE(${chillScore ?? null}, chill_score),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, clerk_id, account_status, tier, og_status, chill_score
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const user = rows[0];
  try {
    const clerk = await clerkClient();
    const metadata: Record<string, unknown> = {};
    if (accountStatus) metadata.accountStatus = accountStatus;
    if (tier) metadata.tier = tier;
    if (ogStatus !== undefined) metadata.ogStatus = ogStatus;
    await clerk.users.updateUserMetadata(user.clerk_id as string, {
      publicMetadata: metadata,
    });
  } catch {
    // Non-critical
  }

  await logAdminAction(admin.id, 'update_user', 'user', id, {
    changes: body,
    adminNotes,
  });

  return NextResponse.json({ success: true, user: rows[0] });
}
