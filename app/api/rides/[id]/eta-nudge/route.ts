import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';

/**
 * Rider-triggered SMS nudge to driver when ETA goes stale (90s no location update).
 * Sends one SMS per ride status phase. Prevents spam via DB flag.
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

    // Get ride + verify caller is the rider
    const rideRows = await sql`
      SELECT rider_id, driver_id, status, eta_nudge_sent_at
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can trigger ETA nudge' }, { status: 403 });
    }

    if (!['otw', 'here', 'confirming'].includes(ride.status as string)) {
      return NextResponse.json({ sent: false, reason: 'not_active' });
    }

    // Check if we already sent a nudge for this status phase (within last 10 min)
    const nudgedAt = ride.eta_nudge_sent_at ? new Date(ride.eta_nudge_sent_at as string).getTime() : 0;
    if (Date.now() - nudgedAt < 10 * 60 * 1000) {
      return NextResponse.json({ sent: false, reason: 'already_sent' });
    }

    // Check if driver actually has a recent GPS update — if yes, don't nudge
    // (client may show stale ETA due to Ably reconnect, but driver is actually sending)
    const recentLocation = await sql`
      SELECT id FROM ride_locations
      WHERE ride_id = ${rideId} AND recorded_at > NOW() - INTERVAL '2 minutes'
      LIMIT 1
    `;
    if (recentLocation.length > 0) {
      return NextResponse.json({ sent: false, reason: 'driver_active' });
    }

    // Get driver phone + rider name
    const driverRows = await sql`
      SELECT dp.phone, dp.display_name as driver_name
      FROM driver_profiles dp WHERE dp.user_id = ${ride.driver_id} LIMIT 1
    `;
    const riderRows = await sql`
      SELECT rp.display_name FROM rider_profiles rp WHERE rp.user_id = ${ride.rider_id} LIMIT 1
    `;

    const driverPhone = (driverRows[0] as Record<string, unknown>)?.phone as string;
    const riderName = (riderRows[0] as Record<string, unknown>)?.display_name as string || 'Your rider';

    if (!driverPhone) {
      return NextResponse.json({ sent: false, reason: 'no_phone' });
    }

    // Send SMS
    const message = `HMU ATL: ${riderName} is waiting and can't see your ETA. Open HMU so they can track your pickup. atl.hmucashride.com/ride/${rideId}`;
    await sendSms(driverPhone, message, {
      rideId,
      userId: ride.driver_id as string,
      eventType: 'eta_nudge',
    });

    // Flag so we don't re-send
    await sql`UPDATE rides SET eta_nudge_sent_at = NOW() WHERE id = ${rideId}`;

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error('ETA nudge error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
