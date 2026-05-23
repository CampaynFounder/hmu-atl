// GET /api/admin/money/shortfalls
// Returns per-ride capture shortfall details for the revenue dashboard alert card.
// Shortfalls are written by captureRiderPayment() when confirmed add-ons exceed
// the add_on_reserve set at authorization time.
import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT
      tl.ride_id,
      tl.amount,
      tl.description,
      tl.created_at,
      r.ref_code,
      r.status as ride_status,
      dp.display_name as driver_name,
      dp.handle as driver_handle,
      rp.handle as rider_handle
    FROM transaction_ledger tl
    JOIN rides r ON r.id = tl.ride_id
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    WHERE tl.event_type = 'capture_shortfall'
    ORDER BY tl.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({
    shortfalls: (rows as Record<string, unknown>[]).map((r) => ({
      rideId: r.ride_id as string,
      refCode: (r.ref_code as string) || null,
      rideStatus: r.ride_status as string,
      amount: Number(r.amount ?? 0),
      description: r.description as string,
      driverName: (r.driver_name as string) || (r.driver_handle as string) || 'Driver',
      driverHandle: (r.driver_handle as string) || null,
      riderHandle: (r.rider_handle as string) || null,
      createdAt: r.created_at as string,
    })),
  });
}
