// Resume — opposite of hand-off. Flips a 'manual' thread back to 'active' so
// the orchestrator resumes Claude replies on new inbound.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const rows = await sql`
    UPDATE conversation_threads
    SET status = 'active', updated_at = NOW()
    WHERE id = ${id} AND status = 'manual'
    RETURNING id, user_id, persona_id, phone, status
  `;
  const thread = rows[0] as { id: string; status: string; phone: string } | undefined;
  if (!thread) return NextResponse.json({ error: 'thread not in manual state' }, { status: 404 });

  await logAdminAction(admin.id, 'conversation_agent.resume', 'conversation_thread', thread.id, { phone: thread.phone });

  return NextResponse.json({ ok: true, thread });
}
