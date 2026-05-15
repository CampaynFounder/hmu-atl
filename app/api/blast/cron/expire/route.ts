// POST /api/blast/cron/expire — per-target 15-minute expiry sweep.
//
// Wired to the Cloudflare Worker cron trigger added in wrangler.worker.jsonc
// + wrangler.staging.jsonc (every minute). The Worker invokes this URL via
// WORKER_SELF_REFERENCE and we run the sweep inline. Keeps the cron logic
// in regular HTTP so it's testable from the dashboard / curl.
//
// Auth: requires CRON_SECRET header so a public POST can't trigger expiry.
// In production the Worker injects the secret; locally an admin can curl it.

import { NextRequest, NextResponse } from 'next/server';
import { expireStaleTargets } from '@/lib/blast/lifecycle';
import { broadcastBlastEvent } from '@/lib/blast/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  // Auth: only allow with the configured cron secret. Falls open in dev when
  // the secret isn't set so manual testing works.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? '';
    if (got !== expected) {
      return NextResponse.json({ error: 'forbidden' }, { status: 401 });
    }
  }

  const expired = await expireStaleTargets({ windowMinutes: 15, limit: 200 });

  // Broadcast each expiry on the rider's blast channel so the offer board
  // dims the expired target without waiting on a poll.
  const blastIdsTouched = new Set(expired.map((e) => e.blastId));
  for (const e of expired) {
    void broadcastBlastEvent(e.blastId, 'target_expired', {
      blastId: e.blastId,
      targetId: e.targetId,
      driverId: e.driverId,
    });
  }

  return NextResponse.json({
    expiredCount: expired.length,
    blastsTouched: blastIdsTouched.size,
  });
}

// GET also accepted so the Cloudflare Worker scheduled() handler can hit
// the same path without changing method semantics. Some worker setups prefer
// GETs for cron triggers because they're caching-friendly.
export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
