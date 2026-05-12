import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { isFeatureEnabled } from '@/lib/feature-flags';

// Time-bucketed deposit series for the Your Deposits detail sheet.
//
// Definition matches /api/driver/balance digitalEarnings: digital (non-cash)
// rides in 'ended' or 'completed' status with no no-show partial. Summed by
// week or month in America/New_York so the buckets line up with how riders
// experience the dates.

interface Bucket {
  label: string;        // "W34" or "Jul 2025"
  periodStart: string;  // ISO date for the start of the bucket
  amount: number;
  rides: number;
  avg: number;          // 3-period trailing moving average
}

const MAX_WINDOW = 12;
const MIN_WINDOW = 2;

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  // Server-side feature gate. Dormant when flag row missing or disabled.
  const enabled = await isFeatureEnabled('driver_deposits_detail_sheet', { userId });
  if (!enabled) return NextResponse.json({ error: 'Not available' }, { status: 404 });

  // 60 reqs/min/user is generous — sheet open + bucket toggle won't fire more
  // than a handful per minute even for power use. Drop a noisy client fast.
  const rate = await checkRateLimit({
    key: `driver:earnings:series:${userId}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const bucketParam = searchParams.get('bucket') === 'month' ? 'month' : 'week';
  const windowParam = Math.min(
    MAX_WINDOW,
    Math.max(MIN_WINDOW, Number(searchParams.get('window')) || 6)
  );

  // date_trunc on the ET-local timestamp keeps weeks Sun→Sat (or Mon→Sun per
  // PG default — Postgres treats weeks as ISO Mon-start, which is fine for
  // analytics; we never surface the start day to the user). Months align
  // on calendar boundaries.
  const rows = (await sql`
    SELECT
      date_trunc(${bucketParam}, ended_at AT TIME ZONE 'America/New_York') as period_start,
      COALESCE(SUM(driver_payout_amount), 0) as amount,
      COUNT(*) as rides
    FROM rides
    WHERE driver_id = ${userId}
      AND (is_cash IS NULL OR is_cash = false)
      AND status IN ('ended', 'completed')
      AND (no_show_percent IS NULL OR no_show_percent = 0)
      AND ended_at IS NOT NULL
      AND ended_at >= NOW() - (${windowParam}::text || ' ' || ${bucketParam} || 's')::interval - INTERVAL '1 day'
    GROUP BY period_start
    ORDER BY period_start ASC
  `) as Array<{ period_start: string | Date; amount: string | number; rides: string | number }>;

  // Backfill empty buckets so the chart renders a continuous x-axis even when
  // the driver had a quiet week. Iterate from (now - window) → now.
  const filled: Bucket[] = [];
  const byKey = new Map<string, { amount: number; rides: number }>();
  for (const r of rows) {
    const key = new Date(r.period_start).toISOString().slice(0, 10);
    byKey.set(key, {
      amount: Math.round(Number(r.amount) * 100) / 100,
      rides: Number(r.rides),
    });
  }

  const now = new Date();
  for (let i = windowParam - 1; i >= 0; i--) {
    const d = new Date(now);
    if (bucketParam === 'week') {
      d.setDate(d.getDate() - i * 7);
      // Snap to Monday — matches PG date_trunc('week', ...) default.
      const day = d.getDay();
      const diff = (day + 6) % 7; // Mon=0
      d.setDate(d.getDate() - diff);
    } else {
      d.setMonth(d.getMonth() - i, 1);
    }
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const hit = byKey.get(key);
    const label = bucketParam === 'week'
      ? `W${weekOfYear(d)}`
      : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    filled.push({
      label,
      periodStart: key,
      amount: hit?.amount ?? 0,
      rides: hit?.rides ?? 0,
      avg: 0, // filled in below
    });
  }

  // 3-period trailing moving average for the trend line.
  for (let i = 0; i < filled.length; i++) {
    const start = Math.max(0, i - 2);
    const slice = filled.slice(start, i + 1);
    const sum = slice.reduce((s, b) => s + b.amount, 0);
    filled[i].avg = Math.round((sum / slice.length) * 100) / 100;
  }

  const total = filled.reduce((s, b) => s + b.amount, 0);
  const totalRides = filled.reduce((s, b) => s + b.rides, 0);
  const nonZero = filled.filter(b => b.amount > 0).length;

  return NextResponse.json({
    bucket: bucketParam,
    window: windowParam,
    series: filled,
    total: Math.round(total * 100) / 100,
    rides: totalRides,
    nonZeroBuckets: nonZero,
  });
}

function weekOfYear(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}
