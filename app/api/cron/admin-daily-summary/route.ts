// GET /api/cron/admin-daily-summary
// Sends super-admins a daily push summarizing the last 24h: rides requested,
// completed, GMV, revenue (platform fees), and profit (fees − Stripe cost).
//
// Scheduled from .github/workflows/cron.yml at BOTH 11:00 and 12:00 UTC; the
// handler only actually runs when it's 7am in America/New_York, so it fires
// exactly once/day year-round across the EST/EDT shift. `?force=1` bypasses the
// hour + config gates for testing.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminPushConfig, sendDailySummary } from '@/lib/admin/push-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function atlantaHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';

  // DST-safe: only run at 7am Atlanta time (unless forced for testing).
  if (!force && atlantaHour() !== 7) {
    return NextResponse.json({ skipped: true, reason: 'not 7am ET', etHour: atlantaHour() });
  }
  if (!force) {
    const cfg = await getAdminPushConfig();
    if (!cfg.dailySummary) return NextResponse.json({ skipped: true, reason: 'disabled' });
  }

  const result = await sendDailySummary();
  return NextResponse.json({ ok: true, ...result });
}
