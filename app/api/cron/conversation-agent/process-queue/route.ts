// Conversation agent cron — drains scheduled_outbound_messages.
// Schedule: once per minute via Cloudflare cron trigger (configure later in
// wrangler.worker.jsonc; for now it can be poked manually with CRON_SECRET).
//
// Security: X-Cron-Secret header matches process.env.CRON_SECRET. We do NOT
// use Authorization: Bearer because Clerk middleware intercepts that header
// and tries to parse it as a Clerk JWT, 307-redirecting to /sign-in on
// mismatch. Feature flag check inside drainQueue (short circuits if
// conversation_agent is OFF — safe to schedule before flag flip).

import { NextRequest, NextResponse } from 'next/server';
import { drainQueue } from '@/lib/conversation/scheduler';
import { scheduleDueFollowups } from '@/lib/conversation/followups';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const sentSecret = req.headers.get('x-cron-secret') || '';
  if (!secret || sentSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl;
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200);

  const drain = await drainQueue(limit);
  const followups = await scheduleDueFollowups();
  return NextResponse.json({ ok: true, drain, followups });
}
