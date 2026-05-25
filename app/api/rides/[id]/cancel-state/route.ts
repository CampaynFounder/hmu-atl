// Tiny endpoint for the active-ride client's safety poll. Returns only
// what's needed to detect a server-side cancellation that the Ably
// status_change event might have missed (reconnect outside the 2-min
// rewind window, dropped event, dual-tab desync).
//
// Single SELECT, no joins. Polls every 8s while a cancel-request banner
// is open, so we keep it cheap.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: rideId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  const rows = (await sql`
    SELECT status, cancel_requested_at, cancel_requested_by, cancel_resolution
    FROM rides
    WHERE id = ${rideId}
      AND (rider_id = ${userId} OR driver_id = ${userId})
    LIMIT 1
  `) as Array<{
    status: string;
    cancel_requested_at: Date | null;
    cancel_requested_by: string | null;
    cancel_resolution: string | null;
  }>;

  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const r = rows[0];
  return NextResponse.json({
    status: r.status,
    cancel_requested_at: r.cancel_requested_at,
    cancel_requested_by: r.cancel_requested_by,
    cancel_resolution: r.cancel_resolution,
  });
}
