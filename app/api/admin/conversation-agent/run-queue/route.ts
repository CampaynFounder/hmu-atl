// Admin-triggered manual run of the conversation-agent cron. Does the same
// work as /api/cron/conversation-agent/process-queue but authenticated via
// Clerk admin session instead of CRON_SECRET — useful for testing new
// opt-ins without waiting 5 minutes for the GitHub Actions schedule.

import { NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { drainQueue } from '@/lib/conversation/scheduler';
import { scheduleDueFollowups } from '@/lib/conversation/followups';

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.convagent.edit')) return unauthorizedResponse();

  const drain = await drainQueue(200);
  const followups = await scheduleDueFollowups();

  await logAdminAction(admin.id, 'conversation_agent.manual_run', 'conversation_agent', undefined, {
    drain_scanned: drain.scanned,
    drain_sent: drain.sent,
    drain_failed: drain.failed,
    followups_queued: followups.queued,
    followups_dormanted: followups.dormanted,
  });

  return NextResponse.json({ ok: true, drain, followups });
}
