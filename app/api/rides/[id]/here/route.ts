import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';

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

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can mark HERE' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'here')) {
      return NextResponse.json({ error: `Cannot mark HERE from status: ${ride.status}` }, { status: 400 });
    }

    await sql`
      UPDATE rides SET
        status = 'here',
        here_at = NOW(),
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'otw'
    `;

    return NextResponse.json({ status: 'here', rideId });
  } catch (error) {
    console.error('HERE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
