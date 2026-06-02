import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

// GET /api/rides/[id]/rider-view
// Mobile: returns all fields the rider needs for the active ride screen.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rows = await sql`
      SELECT
        r.id,
        r.ref_code,
        r.status,
        r.amount,
        r.final_agreed_price,
        r.proposed_price,
        r.proposed_price_reason,
        r.is_cash,
        r.coo_at,
        r.pickup_address,
        r.pickup_lat,
        r.pickup_lng,
        r.dropoff_address,
        r.dropoff_lat,
        r.dropoff_lng,
        r.trip_type,
        r.stops,
        r.agreement_summary->>'timeDisplay' AS pickup_time_display,
        r.agreement_summary->>'time'        AS pickup_time_raw,
        r.agreement_summary->>'isNow'       AS pickup_is_now,
        r.add_on_total,
        r.add_on_reserve,
        r.created_at,
        r.started_at,
        r.ended_at,
        r.otw_at,
        r.here_at,
        r.driver_id,
        r.rider_id,
        COALESCE(dp.handle, dp.display_name, dp.first_name) AS driver_handle,
        dp.first_name   AS driver_first_name,
        dp.thumbnail_url AS driver_avatar_url,
        u2.chill_score  AS driver_chill_score,
        u2.completed_rides AS driver_completed_rides
      FROM rides r
      LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
      LEFT JOIN users u2           ON u2.id = r.driver_id
      WHERE r.id = ${rideId}
        AND (r.driver_id = ${userId} OR r.rider_id = ${userId})
      LIMIT 1
    `;

    if (!rows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });

    const r = rows[0] as Record<string, unknown>;

    if (r.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can access this view' }, { status: 403 });
    }

    return NextResponse.json({
      id: r.id,
      refCode: r.ref_code ?? null,
      status: r.status,
      agreedPrice: Number(r.final_agreed_price ?? r.amount ?? 0),
      proposedPrice: r.proposed_price != null ? Number(r.proposed_price) : null,
      proposedPriceReason: (r.proposed_price_reason as string) ?? null,
      isCash: Boolean(r.is_cash),
      cooAt: r.coo_at ?? null,
      pickupAddress: r.pickup_address ?? null,
      pickupLat: r.pickup_lat ? Number(r.pickup_lat) : null,
      pickupLng: r.pickup_lng ? Number(r.pickup_lng) : null,
      dropoffAddress: r.dropoff_address ?? null,
      dropoffLat: r.dropoff_lat ? Number(r.dropoff_lat) : null,
      dropoffLng: r.dropoff_lng ? Number(r.dropoff_lng) : null,
      tripType: (r.trip_type as string) ?? 'one_way',
      stops: (r.stops as Array<{ lat: number; lng: number; address?: string }>) ?? [],
      pickupTime: (r.pickup_time_display as string) || (r.pickup_time_raw as string) || null,
      pickupTimeIsNow: r.pickup_is_now === 'true' || String(r.pickup_time_raw ?? '').toLowerCase() === 'now',
      addOnTotal: Number(r.add_on_total ?? 0),
      addOnReserve: Number(r.add_on_reserve ?? 0),
      createdAt: r.created_at,
      startedAt: r.started_at ?? null,
      endedAt: r.ended_at ?? null,
      otwAt: r.otw_at ?? null,
      hereAt: r.here_at ?? null,
      driverId: r.driver_id ?? null,
      driverHandle: r.driver_handle ?? null,
      driverFirstName: r.driver_first_name ?? null,
      driverAvatarUrl: r.driver_avatar_url ?? null,
      driverChillScore: Number(r.driver_chill_score ?? 0),
      driverCompletedRides: Number(r.driver_completed_rides ?? 0),
    });
  } catch (error) {
    console.error('[rider-view]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
