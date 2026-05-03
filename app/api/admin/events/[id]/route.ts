import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveActionItem } from '@/lib/admin/action-items';

const ALLOWED_STATUSES = new Set(['new', 'contacted', 'scoped', 'won', 'lost', 'closed']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminRows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!adminRows[0]?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const status = String(body.status || '').trim();

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Stamp contacted_at on first move out of 'new' (only if still null).
    // Stamp closed_at when entering a terminal state (won/lost/closed).
    const isTerminal = status === 'won' || status === 'lost' || status === 'closed';
    const rows = await sql`
      UPDATE event_inquiries
      SET status = ${status},
          contacted_at = CASE
            WHEN ${status} <> 'new' AND contacted_at IS NULL THEN NOW()
            ELSE contacted_at
          END,
          closed_at = CASE
            WHEN ${isTerminal} THEN NOW()
            ELSE closed_at
          END,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Resolve the admin action-item once an inquiry leaves "new"
    if (status !== 'new') {
      await resolveActionItem('events', id);
    }

    return NextResponse.json({ id: rows[0].id, status: rows[0].status });
  } catch (error) {
    console.error('Admin event inquiry update error:', error);
    return NextResponse.json({ error: 'Failed to update inquiry' }, { status: 500 });
  }
}
