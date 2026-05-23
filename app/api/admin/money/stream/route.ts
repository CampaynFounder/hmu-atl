// GET /api/admin/money/stream?type=rides|extras|deposits|subscriptions&period=all|monthly|weekly|daily
// Returns the underlying transaction_ledger entries for a given revenue stream,
// used by the revenue breakdown drill-in sheet on the admin money dashboard.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const STREAM_EVENT_TYPES: Record<string, string[]> = {
  rides: ['platform_fee'],
  extras: ['extra_platform_fee'],
  deposits: ['cancel_platform_fee', 'no_show_platform_fee'],
  shortfalls: ['capture_shortfall'],
};

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type') ?? 'rides';
  const period = searchParams.get('period') ?? 'all';

  const eventTypes = STREAM_EVENT_TYPES[type];
  if (!eventTypes) return NextResponse.json({ error: 'Unknown stream type' }, { status: 400 });

  let interval: string;
  if (period === 'monthly') interval = '30 days';
  else if (period === 'weekly') interval = '7 days';
  else if (period === 'daily') interval = '1 day';
  else interval = '3650 days';

  const isAllTime = period === 'all';

  const rows = isAllTime
    ? await sql`
        SELECT
          tl.id, tl.ride_id, tl.event_type, tl.amount, tl.direction,
          tl.description, tl.created_at,
          r.ref_code,
          dp.display_name as driver_name, dp.handle as driver_handle,
          rp.handle as rider_handle
        FROM transaction_ledger tl
        LEFT JOIN rides r ON r.id = tl.ride_id
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        WHERE tl.event_type = ANY(${eventTypes})
        ORDER BY tl.created_at DESC
        LIMIT 100
      `
    : await sql`
        SELECT
          tl.id, tl.ride_id, tl.event_type, tl.amount, tl.direction,
          tl.description, tl.created_at,
          r.ref_code,
          dp.display_name as driver_name, dp.handle as driver_handle,
          rp.handle as rider_handle
        FROM transaction_ledger tl
        LEFT JOIN rides r ON r.id = tl.ride_id
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        WHERE tl.event_type = ANY(${eventTypes})
          AND tl.created_at > NOW() - ${interval}::interval
        ORDER BY tl.created_at DESC
        LIMIT 100
      `;

  return NextResponse.json({
    entries: (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      rideId: (r.ride_id as string) || null,
      refCode: (r.ref_code as string) || null,
      eventType: r.event_type as string,
      amount: Number(r.amount ?? 0),
      direction: r.direction as string,
      description: r.description as string,
      driverName: (r.driver_name as string) || (r.driver_handle as string) || null,
      riderHandle: (r.rider_handle as string) || null,
      createdAt: r.created_at as string,
    })),
  });
}
