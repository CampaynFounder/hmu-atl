// GET /api/cron/admin-daily-summary
// Pushes super-admins a daily summary of the last 24h: rides requested,
// completed, GMV, revenue (platform fees), profit (fees − Stripe cost).
//
// Called on the reliable */5 cron (GitHub Actions drops exact top-of-hour
// schedules), so the endpoint owns the timing: it sends once per ET day, on the
// first tick in the 7–9am ET morning window, guarded by a stored last-sent date
// so the many */5 ticks don't each fire it. `?force=1` bypasses all gates.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { getPlatformConfig, invalidatePlatformConfig } from '@/lib/platform-config/get';
import { getAdminPushConfig, sendDailySummary } from '@/lib/admin/push-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_KEY = 'admin.daily_summary_state';

function atlantaHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
}

// 'YYYY-MM-DD' for today in Atlanta.
function atlantaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  const etDate = atlantaDate();

  if (!force) {
    const hour = atlantaHour();
    // Morning window — catches the first tick after 7am even if the cron is delayed.
    if (hour < 7 || hour > 9) {
      return NextResponse.json({ skipped: true, reason: 'outside 7–9am ET', etHour: hour });
    }
    const cfg = await getAdminPushConfig();
    if (!cfg.dailySummary) return NextResponse.json({ skipped: true, reason: 'disabled' });

    // Idempotency: only one send per ET day.
    const state = await getPlatformConfig(STATE_KEY, { lastSentEtDate: '' });
    if (state.lastSentEtDate === etDate) {
      return NextResponse.json({ skipped: true, reason: 'already sent today', etDate });
    }
  }

  const result = await sendDailySummary();

  // Record today's send so later ticks skip.
  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_at)
    VALUES (${STATE_KEY}, ${JSON.stringify({ lastSentEtDate: etDate })}::jsonb, NOW())
    ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()
  `;
  invalidatePlatformConfig(STATE_KEY);

  return NextResponse.json({ ok: true, etDate, ...result });
}
