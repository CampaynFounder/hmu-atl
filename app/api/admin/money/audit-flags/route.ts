import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

interface AuditFlag {
  type: string;
  severity: 'warning' | 'urgent' | 'info';
  rideId?: string;
  driverId?: string;
  amount?: number;
  message: string;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const period = req.nextUrl.searchParams.get('period') ?? 'monthly';
  const interval = period === 'weekly' ? '7 days' : period === 'daily' ? '1 day' : '30 days';

  try {
    const [addonGtRide, largeAddons, outlierRides, staleHolds] = await Promise.all([
      // Add-on revenue > ride revenue for a driver
      sql`
        SELECT r.driver_id, dp.display_name as driver_name,
          SUM(COALESCE(r.add_on_total, 0)) as total_addons,
          SUM(COALESCE(r.final_agreed_price, r.amount, 0)) as total_fares
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        WHERE r.status IN ('completed', 'ended')
          AND r.created_at > NOW() - ${interval}::interval
        GROUP BY r.driver_id, dp.display_name
        HAVING SUM(COALESCE(r.add_on_total, 0)) > SUM(COALESCE(r.final_agreed_price, r.amount, 0))
          AND SUM(COALESCE(r.add_on_total, 0)) > 0
      `,
      // Single ride with add-on > $50
      sql`
        SELECT r.id, r.driver_id, dp.display_name as driver_name, r.add_on_total
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        WHERE COALESCE(r.add_on_total, 0) > 50
          AND r.status IN ('completed', 'ended')
          AND r.created_at > NOW() - ${interval}::interval
        ORDER BY r.add_on_total DESC
        LIMIT 10
      `,
      // Ride amount > 3x average
      sql`
        WITH avg_price AS (
          SELECT AVG(COALESCE(final_agreed_price, amount)) as avg_p
          FROM rides WHERE status = 'completed' AND created_at > NOW() - ${interval}::interval
        )
        SELECT r.id, r.driver_id, dp.display_name as driver_name,
          COALESCE(r.final_agreed_price, r.amount) as price, ap.avg_p
        FROM rides r, avg_price ap
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        WHERE r.status = 'completed'
          AND r.created_at > NOW() - ${interval}::interval
          AND COALESCE(r.final_agreed_price, r.amount) > ap.avg_p * 3
          AND ap.avg_p > 0
        ORDER BY COALESCE(r.final_agreed_price, r.amount) DESC
        LIMIT 10
      `,
      // Payment holds > 48 hours
      sql`
        SELECT r.id, r.driver_id, dp.display_name as driver_name,
          COALESCE(r.final_agreed_price, r.amount) as amount, r.ended_at
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        WHERE r.status = 'ended'
          AND r.ended_at < NOW() - INTERVAL '48 hours'
        ORDER BY r.ended_at ASC
        LIMIT 10
      `,
    ]);

    const flags: AuditFlag[] = [];

    for (const row of addonGtRide) {
      flags.push({
        type: 'addon_exceeds_fare',
        severity: 'warning',
        driverId: row.driver_id as string,
        amount: Number(row.total_addons),
        message: `${row.driver_name || 'Driver'}: add-ons ($${Number(row.total_addons).toFixed(2)}) exceed ride fares ($${Number(row.total_fares).toFixed(2)})`,
      });
    }

    for (const row of largeAddons) {
      flags.push({
        type: 'large_addon',
        severity: 'warning',
        rideId: row.id as string,
        driverId: row.driver_id as string,
        amount: Number(row.add_on_total),
        message: `${row.driver_name || 'Driver'}: single ride add-on $${Number(row.add_on_total).toFixed(2)}`,
      });
    }

    for (const row of outlierRides) {
      flags.push({
        type: 'outlier_price',
        severity: 'warning',
        rideId: row.id as string,
        driverId: row.driver_id as string,
        amount: Number(row.price),
        message: `Ride $${Number(row.price).toFixed(2)} is ${(Number(row.price) / Number(row.avg_p)).toFixed(1)}x the average ($${Number(row.avg_p).toFixed(2)})`,
      });
    }

    for (const row of staleHolds) {
      const hours = row.ended_at ? Math.round((Date.now() - new Date(row.ended_at as string).getTime()) / 3600000) : 0;
      flags.push({
        type: 'stale_hold',
        severity: 'urgent',
        rideId: row.id as string,
        driverId: row.driver_id as string,
        amount: Number(row.amount),
        message: `Payment hold for $${Number(row.amount).toFixed(2)} has been pending ${hours}h (${row.driver_name || 'Driver'})`,
      });
    }

    // Sort: urgent first, then warning
    flags.sort((a, b) => (a.severity === 'urgent' ? 0 : 1) - (b.severity === 'urgent' ? 0 : 1));

    return NextResponse.json({ flags, period });
  } catch (err) {
    console.error('[money/audit-flags] error:', err);
    return NextResponse.json({ error: 'Failed to fetch audit flags' }, { status: 500 });
  }
}
