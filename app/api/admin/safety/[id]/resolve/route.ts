import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { publishAdminEvent } from '@/lib/ably/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.safety.edit')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as { notes?: string };
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null;

  const rows = (await sql`
    UPDATE ride_safety_events SET
      admin_resolved_at = NOW(),
      admin_resolved_by = ${admin.id},
      admin_notes = COALESCE(${notes}, admin_notes)
    WHERE id = ${eventId} AND admin_resolved_at IS NULL
    RETURNING ride_id, event_type
  `) as Array<{ ride_id: string; event_type: string }>;

  if (rows.length === 0) {
    return NextResponse.json({ error: 'not_found_or_already_resolved' }, { status: 404 });
  }

  await publishAdminEvent('safety_event_resolved', {
    eventId,
    rideId: rows[0].ride_id,
    eventType: rows[0].event_type,
    resolvedBy: admin.id,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
