// GET /api/admin/users/growth — User signups over time by type
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const period = searchParams.get('period') ?? 'daily'; // daily | weekly | monthly

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
