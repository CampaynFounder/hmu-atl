import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

// Haversine distance in miles
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 300ft in miles
const PROXIMITY_THRESHOLD = 300 / 5280;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const { chargePercent, driverLat, driverLng, riderLat, riderLng } = body as {
      chargePercent: number; // 0, 25, 50, 100
      driverLat?: number;
      driverLng?: number;
      riderLat?: number;
      riderLng?: number;
    };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can pull off' }, { status: 403 });
    }

    if (ride.status !== 'here') {
      return NextResponse.json({ error: 'Can only pull off from HERE status' }, { status: 400 });
    }

    const agreedPrice = Number(ride.final_agreed_price || ride.amount || 0);
    const chargeAmount = Math.round(agreedPrice * (chargePercent / 100) * 100) / 100;

    // Check proximity
    let closeProximity = false;
    if (driverLat && driverLng && riderLat && riderLng) {
      const distance = haversine(driverLat, driverLng, riderLat, riderLng);
      closeProximity = distance <= PROXIMITY_THRESHOLD;
    }

    const disputeMinutes = closeProximity ? 5 : 0; // Close = rider gets dispute window

    await sql`
      UPDATE rides SET
        status = 'ended',
        ended_at = NOW(),
        pulloff_at = NOW(),
        pulloff_amount = ${chargeAmount},
        pulloff_driver_lat = ${driverLat || null},
        pulloff_driver_lng = ${driverLng || null},
        pulloff_rider_lat = ${riderLat || null},
        pulloff_rider_lng = ${riderLng || null},
        driver_end_lat = ${driverLat || null},
        driver_end_lng = ${driverLng || null},
        rider_end_lat = ${riderLat || null},
        rider_end_lng = ${riderLng || null},
        final_agreed_price = ${chargeAmount},
        dispute_window_expires_at = ${closeProximity ? sql`NOW() + INTERVAL '5 minutes'` : sql`NOW()`},
        updated_at = NOW()
      WHERE id = ${rideId}
    `;

    const message = closeProximity
      ? `Driver pulled off. Rider has ${disputeMinutes} min to dispute $${chargeAmount.toFixed(2)} charge.`
      : `No-show. Driver charged $${chargeAmount.toFixed(2)}.`;

    await publishRideUpdate(rideId, 'ride_ended', {
      status: 'ended',
      pulloff: true,
      chargeAmount,
      closeProximity,
      disputeMinutes,
      message,
    }).catch(() => {});

    await notifyUser(ride.rider_id as string, 'ride_update', {
      rideId,
      status: 'ended',
      pulloff: true,
      chargeAmount,
      disputeMinutes,
      message: closeProximity
        ? `Driver pulled off and charged $${chargeAmount.toFixed(2)}. You have ${disputeMinutes} min to dispute.`
        : `You missed your ride. $${chargeAmount.toFixed(2)} charged for no-show.`,
    }).catch(() => {});

    return NextResponse.json({
      status: 'ended',
      chargeAmount,
      closeProximity,
      disputeMinutes,
    });
  } catch (error) {
    console.error('Pulloff error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
