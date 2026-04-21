// GET /api/admin/rides/active — Active rides for map view + real-time tracking
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');
  // Split branches instead of composing fragments — the neon tag doesn't
  // support fragment composition. The market branch simply adds a
  // WHERE r.market_id = ... clause.
  const rides = marketId
    ? await sql`
        SELECT
          r.id, r.status, COALESCE(r.final_agreed_price, r.amount) as amount,
          r.pickup_address, r.dropoff_address,
          r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng,
          r.is_cash,
          r.created_at, r.updated_at, r.otw_at, r.here_at, r.started_at,
          COALESCE(dp.display_name, dp.first_name) as driver_name, dp.handle as driver_handle,
          COALESCE(rp.display_name, rp.first_name) as rider_name, rp.handle as rider_handle,
          rl.lat as last_lat, rl.lng as last_lng, rl.recorded_at as last_gps_at
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        LEFT JOIN LATERAL (
          SELECT lat, lng, recorded_at FROM ride_locations
          WHERE ride_id = r.id ORDER BY recorded_at DESC LIMIT 1
        ) rl ON true
        WHERE r.status IN ('matched', 'otw', 'here', 'confirming', 'active')
          AND r.created_at > NOW() - INTERVAL '24 hours'
          AND r.market_id = ${marketId}
        ORDER BY r.created_at DESC
      `
    : await sql`
        SELECT
          r.id, r.status, COALESCE(r.final_agreed_price, r.amount) as amount,
          r.pickup_address, r.dropoff_address,
          r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng,
          r.is_cash,
          r.created_at, r.updated_at, r.otw_at, r.here_at, r.started_at,
          COALESCE(dp.display_name, dp.first_name) as driver_name, dp.handle as driver_handle,
          COALESCE(rp.display_name, rp.first_name) as rider_name, rp.handle as rider_handle,
          rl.lat as last_lat, rl.lng as last_lng, rl.recorded_at as last_gps_at
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        LEFT JOIN LATERAL (
          SELECT lat, lng, recorded_at FROM ride_locations
          WHERE ride_id = r.id ORDER BY recorded_at DESC LIMIT 1
        ) rl ON true
        WHERE r.status IN ('matched', 'otw', 'here', 'confirming', 'active')
          AND r.created_at > NOW() - INTERVAL '24 hours'
        ORDER BY r.created_at DESC
      `;

  return NextResponse.json({
    rides: rides.map((r: Record<string, unknown>) => ({
      id: r.id,
      status: r.status,
      price: Number(r.amount ?? 0),
      isCash: r.is_cash ?? false,
      pickupAddress: r.pickup_address ?? null,
      dropoffAddress: r.dropoff_address ?? null,
      pickupLat: r.pickup_lat ? Number(r.pickup_lat) : null,
      pickupLng: r.pickup_lng ? Number(r.pickup_lng) : null,
      dropoffLat: r.dropoff_lat ? Number(r.dropoff_lat) : null,
      dropoffLng: r.dropoff_lng ? Number(r.dropoff_lng) : null,
      driverName: r.driver_name ?? 'Unknown',
      driverHandle: r.driver_handle ?? null,
      riderName: r.rider_name ?? 'Unknown',
      riderHandle: r.rider_handle ?? null,
      // GPS: use ride_locations if available, fall back to pickup coords for matched rides
      lastLat: r.last_lat ? Number(r.last_lat) : (r.pickup_lat ? Number(r.pickup_lat) : null),
      lastLng: r.last_lng ? Number(r.last_lng) : (r.pickup_lng ? Number(r.pickup_lng) : null),
      lastGpsAt: r.last_gps_at ?? null,
      hasLiveGps: !!r.last_lat,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      otwAt: r.otw_at ?? null,
      hereAt: r.here_at ?? null,
      startedAt: r.started_at ?? null,
    })),
  });
}
