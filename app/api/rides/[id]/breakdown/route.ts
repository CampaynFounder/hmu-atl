// GET /api/rides/[id]/breakdown
//
// Returns the post-ride money breakdown (deposit, extras, HMU split, Stripe
// fee, cash). Used by the ride-end page after a live status transition to
// 'ended' so the client can render the breakdown without a full page reload.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { computeRideBreakdown } from '@/lib/payments/breakdown';

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
    SELECT rider_id, driver_id FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  const ride = rideRows[0] as Record<string, unknown>;

  if (ride.rider_id !== userId && ride.driver_id !== userId) {
    return NextResponse.json({ error: 'Not authorized for this ride' }, { status: 403 });
  }

  const breakdown = await computeRideBreakdown(rideId);
  return NextResponse.json({ breakdown });
}
