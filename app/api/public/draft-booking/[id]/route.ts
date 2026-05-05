import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

// Public reads of a parked draft so the auth-callback page can preview the
// booking before forwarding it to /api/drivers/[handle]/book. The caller must
// know the random UUID — drafts aren't enumerable by handle.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const rows = await sql`
    SELECT handle, payload, expires_at, consumed_at
    FROM public_draft_bookings
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = rows[0] as
    | { handle: string; payload: Record<string, unknown>; expires_at: string; consumed_at: string | null }
    | undefined;
  if (!row) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (row.consumed_at) return NextResponse.json({ error: 'Already consumed', code: 'consumed' }, { status: 410 });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Draft expired', code: 'expired' }, { status: 410 });
  }
  return NextResponse.json({
    handle: row.handle,
    payload: row.payload,
    expiresAt: row.expires_at,
  });
}

// Mark consumed once /auth-callback has forwarded it to the booking endpoint
// successfully. Single-use — no replays even if the URL leaks.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const rows = await sql`
    UPDATE public_draft_bookings
    SET consumed_at = NOW()
    WHERE id = ${id} AND consumed_at IS NULL AND expires_at > NOW()
    RETURNING id
  `;
  if (!rows.length) {
    return NextResponse.json({ error: 'Draft not found or already consumed' }, { status: 410 });
  }
  return NextResponse.json({ ok: true });
}
