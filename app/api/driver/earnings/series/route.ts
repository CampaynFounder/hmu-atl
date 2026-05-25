import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { isFeatureEnabled } from '@/lib/feature-flags';

// Time-bucketed deposit series for the Your Deposits detail sheet.
//
// Definition matches /api/driver/balance digitalEarnings: digital (non-cash)
// rides in 'ended' or 'completed' status with no no-show partial. Summed by
// day / week / month in America/New_York so the buckets line up with how
// drivers experience the dates.

type BucketUnit = 'day' | 'week' | 'month';

interface Bucket {
  label: string;        // "5/12" | "W34" | "May 26"
  periodStart: string;  // ET-local date "YYYY-MM-DD"
  amount: number;
  rides: number;
  avg: number;          // 3-period trailing moving average
}

const TZ = 'America/New_York';

const WINDOW_DEFAULT: Record<BucketUnit, number> = { day: 14, week: 6, month: 6 };
const WINDOW_MIN: Record<BucketUnit, number> = { day: 1, week: 1, month: 1 };
const WINDOW_MAX: Record<BucketUnit, number> = { day: 30, week: 12, month: 12 };

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
  const bucketUnit: BucketUnit =
    searchParams.get('bucket') === 'day' ? 'day'
    : searchParams.get('bucket') === 'month' ? 'month'
    : 'week';
  const requestedWindow = Number(searchParams.get('window')) || WINDOW_DEFAULT[bucketUnit];
  const windowParam = Math.min(
    WINDOW_MAX[bucketUnit],
    Math.max(WINDOW_MIN[bucketUnit], requestedWindow)
  );

  // date_trunc on the ET-local timestamp puts day buckets at ET midnight,
  // week buckets on Monday (Postgres ISO default), month buckets on the 1st.
  // We always serialize period_start as the ET-local YYYY-MM-DD so timezone
  // arithmetic never reaches the client.
  const rows = (await sql`
    SELECT
      to_char(
        date_trunc(${bucketUnit}, ended_at AT TIME ZONE ${TZ}),
        'YYYY-MM-DD'
      ) as period_start,
      COALESCE(SUM(driver_payout_amount), 0) as amount,
      COUNT(*) as rides
    FROM rides
    WHERE driver_id = ${userId}
      AND (is_cash IS NULL OR is_cash = false)
      AND status IN ('ended', 'completed')
      AND (no_show_percent IS NULL OR no_show_percent = 0)
      AND ended_at IS NOT NULL
      AND ended_at >= NOW() - (${windowParam}::text || ' ' || ${bucketUnit} || 's')::interval - INTERVAL '1 day'
    GROUP BY period_start
    ORDER BY period_start ASC
  `) as Array<{ period_start: string; amount: string | number; rides: string | number }>;

  const byKey = new Map<string, { amount: number; rides: number }>();
  for (const r of rows) {
    byKey.set(r.period_start, {
      amount: Math.round(Number(r.amount) * 100) / 100,
      rides: Number(r.rides),
    });
  }

  // Backfill the contiguous bucket axis from (now − window + 1) → now.
  // Day arithmetic is done in ET so DST shifts don't drift the labels.
  const filled: Bucket[] = [];
  const todayParts = etDateParts(new Date());

  for (let i = windowParam - 1; i >= 0; i--) {
    const periodStart = bucketStartKey(bucketUnit, todayParts, i);
    const hit = byKey.get(periodStart);
    filled.push({
      label: formatLabel(bucketUnit, periodStart),
      periodStart,
      amount: hit?.amount ?? 0,
      rides: hit?.rides ?? 0,
      avg: 0,
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
    bucket: bucketUnit,
    window: windowParam,
    series: filled,
    total: Math.round(total * 100) / 100,
    rides: totalRides,
    nonZeroBuckets: nonZero,
  });
}

interface DateParts { y: number; m: number; d: number }

// "Now" expressed as Y/M/D in ET. We round-trip through Intl so the function
// works the same whether the Worker is in UTC, ET, or any other timezone.
function etDateParts(now: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const lookup = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: lookup('year'), m: lookup('month'), d: lookup('day') };
}

// Return the YYYY-MM-DD key for the (now − iBucketsAgo)th bucket start.
// Operates on date math in JS — we trust that ET → UTC drift over a 30-day
// window doesn't matter for what's effectively a histogram bin label.
function bucketStartKey(unit: BucketUnit, today: DateParts, ago: number): string {
  // Anchor at ET noon to dodge DST shoulders. Then subtract by unit.
  const anchor = new Date(Date.UTC(today.y, today.m - 1, today.d, 12, 0, 0));

  if (unit === 'day') {
    anchor.setUTCDate(anchor.getUTCDate() - ago);
  } else if (unit === 'week') {
    anchor.setUTCDate(anchor.getUTCDate() - ago * 7);
    // Snap to Monday — Postgres ISO week start.
    const dow = anchor.getUTCDay();
    const back = (dow + 6) % 7; // Mon=0
    anchor.setUTCDate(anchor.getUTCDate() - back);
  } else {
    anchor.setUTCMonth(anchor.getUTCMonth() - ago, 1);
  }

  const y = anchor.getUTCFullYear();
  const m = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const d = String(anchor.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLabel(unit: BucketUnit, periodStart: string): string {
  const [y, m, d] = periodStart.split('-').map(Number);
  if (unit === 'day') return `${m}/${d}`;
  if (unit === 'month') {
    const monthName = new Date(Date.UTC(y, m - 1, 1))
      .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${monthName} ${String(y).slice(-2)}`;
  }
  // week — use ISO-style week-of-year off the bucket's Monday
  return `W${isoWeekOfYear(y, m, d)}`;
}

function isoWeekOfYear(y: number, m: number, d: number): number {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3); // shift to Thursday of the same ISO week
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return 1 + Math.round(((t.getTime() - yearStart) / 86400000 - 3 + ((new Date(yearStart).getUTCDay() + 6) % 7)) / 7);
}
