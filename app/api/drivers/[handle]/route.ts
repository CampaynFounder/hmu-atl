import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const rows = await sql`
    SELECT
      dp.handle,
      dp.first_name,
      dp.areas,
      dp.pricing,
      dp.schedule,
      dp.vehicle_info,
      dp.accept_direct_bookings,
      dp.min_rider_chill_score,
      dp.require_og_status,
      u.tier,
      u.chill_score,
      u.completed_rides,
      u.account_status
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.handle = ${handle}
    LIMIT 1
  `;

  if (!rows.length || rows[0].account_status !== 'active') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const row = rows[0] as Record<string, unknown>;

  return NextResponse.json({
    driver: {
      handle: row.handle,
      displayName: row.first_name,
      areas: row.areas,
      pricing: row.pricing,
      schedule: row.schedule,
      vehiclePhotoUrl: (row.vehicle_info as Record<string, unknown>)?.photo_url ?? null,
      isHmuFirst: row.tier === 'hmu_first',
      chillScore: Number(row.chill_score),
      completedRides: Number(row.completed_rides ?? 0),
      acceptDirectBookings: row.accept_direct_bookings,
      minRiderChillScore: Number(row.min_rider_chill_score),
      requireOgStatus: row.require_og_status,
    },
  });
}
