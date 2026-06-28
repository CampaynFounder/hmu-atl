import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

// GET /api/rides/[id]/driver-view
// Mobile-specific endpoint: returns all fields the driver needs for the active ride screen.
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
        r.driver_payout_amount,
        r.platform_fee_amount,
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
        r.created_at,
        r.started_at,
        r.ended_at,
        r.otw_at,
        r.here_at,
        r.driver_id,
        r.rider_id,
        -- Drivers only ever see the rider's public handle / display name — never first_name.
        COALESCE(rp.handle, rp.display_name) AS rider_handle,
        COALESCE(rp.thumbnail_url, rp.avatar_url) AS rider_avatar_url,
        u2.chill_score  AS rider_chill_score,
        u2.completed_rides AS rider_completed_rides
      FROM rides r
      LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
      LEFT JOIN users u2          ON u2.id = r.rider_id
      WHERE r.id = ${rideId}
        AND (r.driver_id = ${userId} OR r.rider_id = ${userId})
      LIMIT 1
    `;

    if (!rows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });

    const r = rows[0] as Record<string, unknown>;

    if (r.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can access this view' }, { status: 403 });
    }

    return NextResponse.json({
      id: r.id,
      refCode: r.ref_code ?? null,
      status: r.status,
      agreedPrice: Number(r.final_agreed_price ?? r.amount ?? 0),
      proposedPrice: r.proposed_price != null ? Number(r.proposed_price) : null,
      proposedPriceReason: (r.proposed_price_reason as string) ?? null,
      driverPayout: Number(r.driver_payout_amount ?? 0),
      platformFee: Number(r.platform_fee_amount ?? 0),
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
      riderId: r.rider_id ?? null,
      riderHandle: r.rider_handle ?? null,
      riderAvatarUrl: r.rider_avatar_url ?? null,
      riderChillScore: Number(r.rider_chill_score ?? 0),
      riderCompletedRides: Number(r.rider_completed_rides ?? 0),
      createdAt: r.created_at,
      startedAt: r.started_at ?? null,
      endedAt: r.ended_at ?? null,
      otwAt: r.otw_at ?? null,
      hereAt: r.here_at ?? null,
    });
  } catch (error) {
    console.error('[driver-view]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
