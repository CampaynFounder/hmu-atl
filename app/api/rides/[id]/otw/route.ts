import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { notifyRiderDriverOtw } from '@/lib/sms/textbee';
import { syncBookingFromRide } from '@/lib/schedule/conflicts';

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
      return NextResponse.json({ error: 'Only the driver can mark OTW' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'otw')) {
      return NextResponse.json({ error: `Cannot go OTW from status: ${ride.status}` }, { status: 400 });
    }

    // Require COO before OTW
    if (!ride.coo_at) {
      return NextResponse.json({ error: 'Waiting for rider to Pull Up — they need to confirm payment and share location' }, { status: 400 });
    }

    const deadlineMinutes = parseInt(process.env.OTW_DEADLINE_MINUTES || '10');

    await sql`
      UPDATE rides SET
        status = 'otw',
        otw_at = NOW(),
        started_at = NOW(),
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'matched'
    `;

    // Flip the calendar booking to in_progress so the slot stays occupied
    // for any conflict checks during the ride.
    syncBookingFromRide(rideId, 'otw').catch(() => {});

    // Notify rider via Ably
    await publishRideUpdate(rideId, 'status_change', { status: 'otw', message: 'Driver is on the way' }).catch(() => {});
    await notifyUser(ride.rider_id as string, 'ride_update', { rideId, status: 'otw', message: 'Your driver is on the way!' }).catch(() => {});
    publishAdminEvent('ride_status_change', { rideId, status: 'otw' }).catch(() => {});

    // SMS rider
    try {
      const [riderPhoneRows, driverNameRows] = await Promise.all([
        sql`SELECT phone FROM rider_profiles WHERE user_id = ${ride.rider_id} LIMIT 1`,
        sql`SELECT handle FROM driver_profiles WHERE user_id = ${userId} LIMIT 1`,
      ]);
      const riderPhone = (riderPhoneRows[0] as Record<string, unknown>)?.phone as string;
      const driverName = (driverNameRows[0] as Record<string, unknown>)?.handle as string || 'Your driver';
      if (riderPhone) notifyRiderDriverOtw(riderPhone, driverName).catch(() => {});
    } catch { /* non-blocking */ }

    return NextResponse.json({ status: 'otw', rideId });
  } catch (error) {
    console.error('OTW error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
