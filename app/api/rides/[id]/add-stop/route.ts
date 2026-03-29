import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate } from '@/lib/ably/server';

/**
 * POST — Rider requests a new stop during an active ride.
 * PATCH — Driver accepts or declines the stop request.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { address, latitude, longitude } = await req.json() as {
      address: string;
      latitude?: number;
      longitude?: number;
    };

    if (!address) {
      return NextResponse.json({ error: 'Stop address is required' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT r.rider_id, r.driver_id, r.status, r.stops,
             dp.allow_in_route_stops
      FROM rides r
      JOIN driver_profiles dp ON dp.user_id = r.driver_id
      WHERE r.id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can add stops' }, { status: 403 });
    }

    if (!['otw', 'here', 'confirming', 'active'].includes(ride.status as string)) {
      return NextResponse.json({ error: 'Stops can only be added during an active ride' }, { status: 400 });
    }

    if (!ride.allow_in_route_stops) {
      return NextResponse.json({ error: 'This driver does not accept in-route stops' }, { status: 403 });
    }

    // Notify driver via Ably for accept/decline
    await publishRideUpdate(rideId, 'stop_requested', {
      address,
      latitude: latitude || null,
      longitude: longitude || null,
      requestedBy: userId,
    }).catch(() => {});

    return NextResponse.json({ status: 'requested' });
  } catch (error) {
    console.error('Add stop error:', error);
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
    const { action, address, latitude, longitude } = await req.json() as {
      action: 'accept' | 'decline';
      address: string;
      latitude?: number;
      longitude?: number;
    };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, stops FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can respond to stop requests' }, { status: 403 });
    }

    if (action === 'accept') {
      const existingStops = Array.isArray(ride.stops) ? ride.stops as Record<string, unknown>[] : [];
      const newStop = {
        address,
        latitude: latitude || null,
        longitude: longitude || null,
        order: existingStops.length + 1,
        reached_at: null,
        verified: false,
        added_mid_ride: true,
      };
      const updatedStops = [...existingStops, newStop];

      await sql`
        UPDATE rides SET stops = ${JSON.stringify(updatedStops)}::jsonb, updated_at = NOW()
        WHERE id = ${rideId}
      `;

      await publishRideUpdate(rideId, 'stop_accepted', {
        stop: newStop,
        totalStops: updatedStops.length,
      }).catch(() => {});

      return NextResponse.json({ status: 'accepted', stops: updatedStops });
    } else {
      await publishRideUpdate(rideId, 'stop_declined', {
        address,
        message: 'Driver declined the stop request',
      }).catch(() => {});

      return NextResponse.json({ status: 'declined' });
    }
  } catch (error) {
    console.error('Stop response error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
