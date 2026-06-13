// GET /api/partner/v1/drivers/{handle} — partner-authenticated single driver.
// Mirrors the public /api/drivers/{handle} shape, adds partner auth, and
// surfaces accept_partner_bookings so the vendor knows up front whether this
// driver can actually be booked through the API (enforced at booking time).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { authenticatePartner } from '@/lib/partner/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const auth = await authenticatePartner(req, '', 'drivers:read');
  if (!auth.ok) return auth.res;

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
      dp.accept_partner_bookings,
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
    return NextResponse.json({ error: 'not_found', message: 'Driver not found' }, { status: 404 });
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
      acceptPartnerBookings: row.accept_partner_bookings === true,
      minRiderChillScore: Number(row.min_rider_chill_score),
      requireOgStatus: row.require_og_status,
    },
  });
}
