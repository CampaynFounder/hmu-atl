// GET /api/admin/rides/history — recent rides with coords for the map overlay
// AND rider/driver/booking-method detail for the superadmin drill-down.
import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { bookingMethod } from '@/lib/rides/booking-method';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rides = await sql`
    SELECT
      r.id, r.ref_code, r.status,
      r.pickup_lat, r.pickup_lng,
      r.dropoff_lat, r.dropoff_lng,
      r.pickup_address, r.dropoff_address,
      COALESCE(r.final_agreed_price, r.amount) as price,
      r.is_cash,
      r.created_at, r.started_at, r.ended_at,
      dp.display_name as driver_name,
      dp.handle as driver_handle,
      rp.first_name as rider_name,
      rp.handle as rider_handle,
      hp.post_type
    FROM rides r
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    LEFT JOIN hmu_posts hp ON hp.id = r.hmu_post_id
    WHERE r.pickup_lat IS NOT NULL AND r.dropoff_lat IS NOT NULL
      AND r.status IN ('completed', 'ended', 'cancelled', 'disputed')
    ORDER BY r.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json({
    rides: rides.map((r: Record<string, unknown>) => ({
      id: r.id,
      refCode: r.ref_code,
      status: r.status,
      pickupLat: Number(r.pickup_lat),
      pickupLng: Number(r.pickup_lng),
      dropoffLat: Number(r.dropoff_lat),
      dropoffLng: Number(r.dropoff_lng),
      pickupAddress: (r.pickup_address as string) || null,
      dropoffAddress: (r.dropoff_address as string) || null,
      price: Number(r.price || 0),
      isCash: r.is_cash ?? false,
      bookingMethod: bookingMethod((r.post_type as string) ?? null),
      driverName: (r.driver_name as string) || null,
      driverHandle: (r.driver_handle as string) || null,
      riderName: (r.rider_name as string) || null,
      riderHandle: (r.rider_handle as string) || null,
      createdAt: r.created_at,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    })),
  });
}
