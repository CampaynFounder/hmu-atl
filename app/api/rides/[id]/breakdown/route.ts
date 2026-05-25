// GET /api/rides/[id]/breakdown
//
// Returns { status, breakdown } for the ride. Doubles as the defensive
// reconciliation endpoint the client hits on /ride/[id] mount + tab
// focus + Ably reconnect, so stale-cached pages (PWA) can't get stuck
// showing a pre-end state after the server-side ride has moved on.
//
// Status is always returned; breakdown is null when the ride hasn't ended
// yet (no point computing it before there's anything to display).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { computeRideBreakdown } from '@/lib/payments/breakdown';

const ENDED_STATUSES = new Set(['ended', 'completed', 'disputed']);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: rideId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = userRows[0].id;

  const rideRows = await sql`
    SELECT rider_id, driver_id, status FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  const ride = rideRows[0] as Record<string, unknown>;

  if (ride.rider_id !== userId && ride.driver_id !== userId) {
    return NextResponse.json({ error: 'Not authorized for this ride' }, { status: 403 });
  }

  const status = ride.status as string;
  const breakdown = ENDED_STATUSES.has(status)
    ? await computeRideBreakdown(rideId).catch(() => null)
    : null;

  return NextResponse.json({ status, breakdown });
}
