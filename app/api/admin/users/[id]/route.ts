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
        u.og_status, u.chill_score, u.completed_rides, u.dispute_count,
        u.created_at, u.updated_at,
        dp.first_name as driver_first, dp.last_name as driver_last,
        dp.handle, dp.stripe_connect_id, dp.video_url, dp.areas as driver_areas,
        dp.vehicle_info,
        rp.first_name as rider_first, rp.last_name as rider_last,
        rp.stripe_customer_id, rp.phone as rider_phone
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.id = ${id}
      LIMIT 1
    `,
    // Ride history
    sql`
      SELECT id, status, price, application_fee, created_at, updated_at,
        driver_id, rider_id, pickup, dropoff
      FROM rides
      WHERE driver_id = ${id} OR rider_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `,
    // Ratings
    sql`
      SELECT r.rating_type, r.created_at, r.ride_id,
        CASE WHEN r.rater_id = ${id} THEN 'given' ELSE 'received' END as direction,
        CASE WHEN r.rater_id = ${id} THEN r.rated_id ELSE r.rater_id END as other_user_id
      FROM ratings r
      WHERE r.rater_id = ${id} OR r.rated_id = ${id}
      ORDER BY r.created_at DESC
      LIMIT 30
    `,
    // Disputes
    sql`
      SELECT id, ride_id, status, details, created_at
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
      displayName: u.driver_first
        ? `${u.driver_first} ${u.driver_last ?? ''}`.trim()
        : u.rider_first
          ? `${u.rider_first} ${u.rider_last ?? ''}`.trim()
          : 'No name',
      handle: u.handle,
      stripeConnectId: u.stripe_connect_id,
      stripeCustomerId: u.stripe_customer_id,
      videoUrl: u.video_url,
      driverAreas: u.driver_areas,
      vehicleInfo: u.vehicle_info,
      phone: u.rider_phone,
    },
    rides: rideRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      status: r.status,
      price: Number(r.price ?? 0),
      applicationFee: Number(r.application_fee ?? 0),
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
      reason: d.details,
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

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (accountStatus !== undefined) {
    updates.push(`account_status = $${idx++}`);
    values.push(accountStatus);
  }
  if (tier !== undefined) {
    updates.push(`tier = $${idx++}`);
    values.push(tier);
  }
  if (ogStatus !== undefined) {
    updates.push(`og_status = $${idx++}`);
    values.push(ogStatus);
  }
  if (chillScore !== undefined) {
    updates.push(`chill_score = $${idx++}`);
    values.push(chillScore);
  }

  if (!updates.length) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.push(`updated_at = NOW()`);

  const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, clerk_id, account_status, tier, og_status, chill_score`;
  values.push(id);

  const rows = await sql.unsafe(query, values);

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Sync to Clerk
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
