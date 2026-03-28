// GET /api/admin/rides/active — Active rides for map view
import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rides = await sql`
    SELECT
      r.id, r.status, COALESCE(r.final_agreed_price, r.amount) as amount,
      r.pickup, r.dropoff, r.created_at, r.updated_at,
      COALESCE(dp.display_name, dp.first_name) as driver_name, dp.handle as driver_handle,
      COALESCE(rp.display_name, rp.first_name) as rider_name,
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
      pickup: r.pickup,
      dropoff: r.dropoff,
      driverName: r.driver_name ?? 'Unknown',
      driverHandle: r.driver_handle,
      riderName: r.rider_name ?? 'Unknown',
      lastLat: r.last_lat ? Number(r.last_lat) : null,
      lastLng: r.last_lng ? Number(r.last_lng) : null,
      lastGpsAt: r.last_gps_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}
