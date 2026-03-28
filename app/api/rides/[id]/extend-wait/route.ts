import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate } from '@/lib/ably/server';

/**
 * POST — Rider requests more wait time
 * PATCH — Driver approves or denies the extension
 */

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT rider_id, driver_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can request more time' }, { status: 403 });
    }

    if (ride.status !== 'here') {
      return NextResponse.json({ error: 'Extension only available when driver is HERE' }, { status: 400 });
    }

    // Notify driver via Ably
    await publishRideUpdate(rideId, 'extend_wait_request', {
      message: 'Rider needs more time to get to the car',
    }).catch(() => {});

    return NextResponse.json({ requested: true });
  } catch (error) {
    console.error('Extend wait request error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const { approve, extraMinutes = 3 } = body as { approve: boolean; extraMinutes?: number };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT rider_id, driver_id, status, wait_minutes FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can approve extensions' }, { status: 403 });
    }

    if (approve) {
      const cappedExtra = Math.min(extraMinutes, 5); // Max 5 min extension
      const newWait = Number(ride.wait_minutes || 5) + cappedExtra;

      await sql`UPDATE rides SET wait_minutes = ${newWait} WHERE id = ${rideId}`;

      await publishRideUpdate(rideId, 'extend_wait_approved', {
        extraMinutes: cappedExtra,
        newWaitMinutes: newWait,
      }).catch(() => {});

      return NextResponse.json({ approved: true, extraMinutes: cappedExtra, newWaitMinutes: newWait });
    } else {
      await publishRideUpdate(rideId, 'extend_wait_denied', {
        message: 'Driver declined the extension',
      }).catch(() => {});

      return NextResponse.json({ approved: false });
    }
  } catch (error) {
    console.error('Extend wait response error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
