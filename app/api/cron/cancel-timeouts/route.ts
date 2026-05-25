// Cron backstop for the rider-cancel-after-OTW timeout path.
//
// Both clients (rider's and driver's active-ride pages) run a countdown
// and POST to /api/rides/[id]/cancel-request/timeout when it hits zero,
// so under normal conditions the timeout resolves within milliseconds of
// the deadline. This cron exists to catch the case where neither client
// is open — closed tabs, dead phones, network drop on both sides.
//
// Picks up rides where:
//   status IN ('otw', 'here')
//   cancel_requested_at IS NOT NULL
//   cancel_resolution IS NULL
//   cancel_requested_at < NOW() - INTERVAL 'cancellation.request_timeout_seconds'
//
// Each row is resolved through the same resolveCancelTimeout() helper as
// the user-facing route, so behavior is identical regardless of who fires.
//
// Wired in .github/workflows/cron.yml — see that file for the schedule.
// Fires every 5 minutes (GitHub Actions cron floor); a stale request is
// resolved within at most timeout + 5min if both clients went dark.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { resolveCancelTimeout } from '@/lib/rides/cancel-timeout';
import { getPlatformConfig } from '@/lib/platform-config/get';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const sentSecret = req.headers.get('x-cron-secret') || '';
  if (!secret || sentSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cfg = await getPlatformConfig('cancellation.request_timeout_seconds', { value: 180 });
  const timeoutSeconds = Math.max(1, Number(cfg.value) || 180);

  const stale = (await sql`
    SELECT id FROM rides
    WHERE status IN ('otw', 'here')
      AND cancel_requested_at IS NOT NULL
      AND cancel_resolution IS NULL
      AND cancel_requested_at < NOW() - (${timeoutSeconds} || ' seconds')::interval
    ORDER BY cancel_requested_at ASC
    LIMIT 100
  `) as Array<{ id: string }>;

  let resolved = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of stale) {
    try {
      const result = await resolveCancelTimeout(row.id);
      if (result.status === 'cancelled') resolved++;
      else skipped++;
    } catch (err) {
      console.error('[cron/cancel-timeouts] failed for', row.id, err);
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: stale.length,
    resolved,
    skipped,
    errors,
    timeoutSeconds,
  });
}
