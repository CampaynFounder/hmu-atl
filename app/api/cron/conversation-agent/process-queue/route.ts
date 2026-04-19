// Conversation agent cron — drains scheduled_outbound_messages.
// Schedule: once per minute via Cloudflare cron trigger (configure later in
// wrangler.worker.jsonc; for now it can be poked manually with CRON_SECRET).
//
// Security: Bearer CRON_SECRET. Feature flag check inside drainQueue (short
// circuits if conversation_agent is OFF — so this is safe to schedule even
// before flag flip).

import { NextRequest, NextResponse } from 'next/server';
import { drainQueue } from '@/lib/conversation/scheduler';
import { scheduleDueFollowups } from '@/lib/conversation/followups';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl;
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200);

  const drain = await drainQueue(limit);
  const followups = await scheduleDueFollowups();
  return NextResponse.json({ ok: true, drain, followups });
}
