// Cron backstop for post-level expiry on hmu_posts.
//
// hmu_posts.expires_at and .booking_expires_at are honored *lazily* across
// the codebase — every list endpoint (rider/posts, driver/home, driver/posts,
// driver/[handle]/book, bookings/[postId]/select, bookings/[postId]/accept,
// admin/hmus/[id]/revoke) runs an inline `UPDATE … SET status='expired'`
// before reading. If no one opens those pages, stale rows stay 'active'
// forever — riders see ghost matches on their offer boards, drivers see
// requests that ended hours ago, search results are noisy.
//
// This cron sweeps all four post_types that carry expiry semantics
// (blast, rider_request, direct_booking, driver_available) and applies
// the same UPDATE the lazy paths use. Belt-and-suspenders: the lazy
// expiry stays in place — this is the catch-net for anything no one read.
//
// Auth: same X-Cron-Secret pattern as the other crons in cron.yml.
//
// Side effects intentionally scoped to the status flip — no Stripe
// release, no Ably broadcast, no event writes. (Blast deposits aren't
// authorized until /select, so an expiring active blast has no PI to
// release. Realtime broadcast is left to a follow-up if needed.)
//
// Wired in .github/workflows/cron.yml — every 5 minutes (GH Actions floor).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const sentSecret = req.headers.get('x-cron-secret') || '';
  if (!secret || sentSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rows = (await sql`
    UPDATE hmu_posts
       SET status = 'expired'
     WHERE status = 'active'
       AND post_type IN ('blast', 'rider_request', 'direct_booking', 'driver_available')
       AND (expires_at < NOW() OR booking_expires_at < NOW())
    RETURNING id, post_type
  `) as Array<{ id: string; post_type: string }>;

  const byType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.post_type] = (byType[r.post_type] ?? 0) + 1;
  }

  return NextResponse.json({
    expiredCount: rows.length,
    byPostType: byType,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return GET(req);
}
