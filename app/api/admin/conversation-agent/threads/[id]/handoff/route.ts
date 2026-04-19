// Hand-off action — flips a conversation thread to status='manual' so the
// orchestrator ignores new inbound messages. Admin takes over via
// /admin/messages or direct SMS.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { publishAdminEvent } from '@/lib/ably/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };

  const rows = await sql`
    UPDATE conversation_threads
    SET
      status = 'manual',
      flagged_for_review = TRUE,
      flag_reason = COALESCE(${reason ?? null}, flag_reason, 'handoff'),
      updated_at = NOW()
    WHERE id = ${id} AND status NOT IN ('opted_out','closed')
    RETURNING id, user_id, persona_id, phone, status
  `;
  const thread = rows[0] as { id: string; user_id: string; persona_id: string; phone: string; status: string } | undefined;
  if (!thread) return NextResponse.json({ error: 'thread not found or already closed' }, { status: 404 });

  // Cancel any pending outbound so Claude follow-ups can't fire after hand-off.
  await sql`
    UPDATE scheduled_outbound_messages
    SET status = 'cancelled', processed_at = NOW(), last_error = 'handoff'
    WHERE thread_id = ${thread.id} AND status = 'pending'
  `;

  await logAdminAction(admin.id, 'conversation_agent.handoff', 'conversation_thread', thread.id, { reason: reason ?? null, phone: thread.phone });

  try {
    await publishAdminEvent('conversation_handoff', {
      thread_id: thread.id,
      phone: thread.phone,
      admin_id: admin.id,
      reason: reason ?? null,
      timestamp: Date.now(),
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, thread });
}
