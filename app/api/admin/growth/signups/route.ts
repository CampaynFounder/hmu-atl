// GET /api/admin/growth/signups — daily rider/driver signups for the growth dashboard.
// Query params:
//   marketId — UUID; if omitted, aggregates across all markets
//   range    — '7d' | '30d' | '90d' (default 30d)
// Returns: { range, marketId, days: [{ date: 'YYYY-MM-DD', riders, drivers }], totals: {...}, weekOverWeek: {...} }
//
// The series is zero-filled so charts have a continuous x-axis. Week-over-week
// compares the trailing 7d to the prior 7d, which is what the dashboard cards display.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const sp = req.nextUrl.searchParams;
  const marketId = sp.get('marketId') || null;
  const rangeKey = sp.get('range') ?? '30d';
  const days = RANGE_DAYS[rangeKey] ?? 30;

  const rows = (await sql`
    SELECT
      to_char(created_at AT TIME ZONE 'UTC'::text, 'YYYY-MM-DD') AS date,
      COUNT(*) FILTER (WHERE profile_type = 'rider')  AS riders,
      COUNT(*) FILTER (WHERE profile_type = 'driver') AS drivers
    FROM users
    WHERE created_at >= NOW() - (${days} || ' days')::interval
      AND (${marketId}::uuid IS NULL OR market_id = ${marketId}::uuid)
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<{ date: string; riders: string | number; drivers: string | number }>;

  // Zero-fill the series so the chart x-axis is contiguous.
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const today = new Date();
  const series: { date: string; riders: number; drivers: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = byDate.get(key);
    series.push({
      date: key,
      riders: Number(hit?.riders ?? 0),
      drivers: Number(hit?.drivers ?? 0),
    });
  }

  const sum = (k: 'riders' | 'drivers', start: number, end: number) =>
    series.slice(start, end).reduce((acc, p) => acc + p[k], 0);

  const totalsInRange = {
    riders: sum('riders', 0, series.length),
    drivers: sum('drivers', 0, series.length),
  };

  // Week-over-week: trailing 7d vs the 7d before that. Only meaningful if range >= 14d.
  const last7Start = Math.max(0, series.length - 7);
  const prev7Start = Math.max(0, series.length - 14);
  const last7 = {
    riders: sum('riders', last7Start, series.length),
    drivers: sum('drivers', last7Start, series.length),
  };
  const prev7 = {
    riders: sum('riders', prev7Start, last7Start),
    drivers: sum('drivers', prev7Start, last7Start),
  };
  const pctChange = (now: number, prev: number) =>
    prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100);
  const weekOverWeek = {
    riders: { last: last7.riders, prev: prev7.riders, pct: pctChange(last7.riders, prev7.riders) },
    drivers: { last: last7.drivers, prev: prev7.drivers, pct: pctChange(last7.drivers, prev7.drivers) },
  };

  // All-time totals so the page can show "X total drivers" alongside the period view.
  const allTimeRows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE profile_type = 'rider')  AS riders,
      COUNT(*) FILTER (WHERE profile_type = 'driver') AS drivers
    FROM users
    WHERE (${marketId}::uuid IS NULL OR market_id = ${marketId}::uuid)
  `) as Array<{ riders: string | number; drivers: string | number }>;
  const allTime = {
    riders: Number(allTimeRows[0]?.riders ?? 0),
    drivers: Number(allTimeRows[0]?.drivers ?? 0),
  };

  return NextResponse.json({
    range: rangeKey,
    marketId,
    series,
    totalsInRange,
    weekOverWeek,
    allTime,
  });
}
