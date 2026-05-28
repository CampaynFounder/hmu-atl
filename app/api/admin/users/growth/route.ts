// GET /api/admin/users/growth — User signups over time by type
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const period   = searchParams.get('period') ?? 'daily';
  const rawDays  = parseInt(searchParams.get('days') ?? '7', 10);
  const days     = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 3650) : 7;
  const marketId = searchParams.get('marketId') || null;
  const since    = new Date(Date.now() - days * 86_400_000).toISOString();

  // Market-scoped summary: new signups in period + all-time totals
  const [newRows, allRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE profile_type = 'rider')::int  AS new_riders,
        COUNT(*) FILTER (WHERE profile_type = 'driver')::int AS new_drivers
      FROM users
      WHERE created_at > ${since}
        AND account_status <> 'banned'
        AND (${marketId}::uuid IS NULL OR market_id = ${marketId}::uuid)
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE profile_type = 'rider')::int  AS total_riders,
        COUNT(*) FILTER (WHERE profile_type = 'driver')::int AS total_drivers,
        COUNT(*) FILTER (WHERE profile_type = 'driver' AND id IN (
          SELECT user_id FROM driver_profiles WHERE profile_visible = true AND payout_setup_complete = true
        ))::int AS active_drivers
      FROM users
      WHERE account_status <> 'banned'
        AND (${marketId}::uuid IS NULL OR market_id = ${marketId}::uuid)
    `,
  ]);

  const n = newRows[0]  as { new_riders: number; new_drivers: number };
  const t = allRows[0]  as { total_riders: number; total_drivers: number; active_drivers: number };

  // Return summary first so AdminSheet can use it without reading the full chart data
  const summary = {
    period_days:   days,
    newRiders:     n.new_riders    ?? 0,
    newDrivers:    n.new_drivers   ?? 0,
    totalRiders:   t.total_riders  ?? 0,
    totalDrivers:  t.total_drivers ?? 0,
    activeDrivers: t.active_drivers ?? 0,
  };

  try {
    let rows;
    if (period === 'monthly') {
      rows = await sql`
        SELECT
          to_char(date_trunc('month', created_at), 'YYYY-MM') as bucket,
          COUNT(*) FILTER (WHERE profile_type = 'rider') as riders,
          COUNT(*) FILTER (WHERE profile_type = 'driver') as drivers,
          COUNT(*) FILTER (WHERE profile_type NOT IN ('rider', 'driver')) as other,
          COUNT(*) as total
        FROM users
        GROUP BY date_trunc('month', created_at)
        ORDER BY date_trunc('month', created_at) ASC
      `;
    } else if (period === 'weekly') {
      rows = await sql`
        SELECT
          to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as bucket,
          COUNT(*) FILTER (WHERE profile_type = 'rider') as riders,
          COUNT(*) FILTER (WHERE profile_type = 'driver') as drivers,
          COUNT(*) FILTER (WHERE profile_type NOT IN ('rider', 'driver')) as other,
          COUNT(*) as total
        FROM users
        GROUP BY date_trunc('week', created_at)
        ORDER BY date_trunc('week', created_at) ASC
      `;
    } else {
      rows = await sql`
        SELECT
          to_char(created_at::date, 'YYYY-MM-DD') as bucket,
          COUNT(*) FILTER (WHERE profile_type = 'rider') as riders,
          COUNT(*) FILTER (WHERE profile_type = 'driver') as drivers,
          COUNT(*) FILTER (WHERE profile_type NOT IN ('rider', 'driver')) as other,
          COUNT(*) as total
        FROM users
        GROUP BY created_at::date
        ORDER BY created_at::date ASC
      `;
    }

    // Also get totals by type
    const totals = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE profile_type = 'rider') as riders,
        COUNT(*) FILTER (WHERE profile_type = 'driver') as drivers,
        COUNT(*) FILTER (WHERE profile_type NOT IN ('rider', 'driver')) as other,
        COUNT(*) FILTER (WHERE account_status = 'active') as active,
        COUNT(*) FILTER (WHERE account_status = 'pending_activation') as pending
      FROM users
    `;

    return NextResponse.json({
      ...summary,
      growth: rows.map((r: Record<string, unknown>) => ({
        bucket: r.bucket,
        riders: Number(r.riders ?? 0),
        drivers: Number(r.drivers ?? 0),
        other: Number(r.other ?? 0),
        total: Number(r.total ?? 0),
      })),
      totals: {
        total: Number(totals[0]?.total ?? 0),
        riders: Number(totals[0]?.riders ?? 0),
        drivers: Number(totals[0]?.drivers ?? 0),
        other: Number(totals[0]?.other ?? 0),
        active: Number(totals[0]?.active ?? 0),
        pending: Number(totals[0]?.pending ?? 0),
      },
      period,
    });
  } catch (error) {
    console.error('User growth error:', error);
    return NextResponse.json({ ...summary, error: 'Chart data unavailable' });
  }
}
