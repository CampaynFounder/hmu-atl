import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

/**
 * Rider proposes an address update (pickup or dropoff).
 * Only allowed in 'matched' status after COO and before driver goes OTW.
 * Driver must confirm or reject via PATCH.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { addressType, address, latitude, longitude } = await req.json() as {
      addressType: 'pickup' | 'dropoff';
      address: string;
      latitude: number;
      longitude: number;
    };

    if (!addressType || !['pickup', 'dropoff'].includes(addressType)) {
      return NextResponse.json({ error: 'Invalid address type' }, { status: 400 });
    }
    if (!address || !latitude || !longitude) {
      return NextResponse.json({ error: 'Address, latitude, and longitude are required' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, status, coo_at
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can update addresses' }, { status: 403 });
    }

    if (ride.status !== 'matched') {
      return NextResponse.json({ error: 'Addresses can only be updated before driver goes OTW' }, { status: 400 });
    }

    // Store proposed address update in ride metadata
    const proposedUpdate = JSON.stringify({ addressType, address, latitude, longitude });
    await sql`
      UPDATE rides SET
        proposed_address_update = ${proposedUpdate}::jsonb,
        updated_at = NOW()
      WHERE id = ${rideId}
    `;

    // Get rider name for notification
    const riderRows = await sql`SELECT display_name FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`;
    const riderName = (riderRows[0] as { display_name: string } | undefined)?.display_name || 'Rider';

    // Notify driver via Ably
    await publishRideUpdate(rideId, 'address_update_proposed', {
      addressType,
      address,
      latitude,
      longitude,
      riderName,
    }).catch(() => {});

    await notifyUser(ride.driver_id as string, 'address_update', {
      rideId,
      addressType,
      address,
      message: `Rider wants to update ${addressType} to: ${address}`,
    }).catch(() => {});

    return NextResponse.json({ status: 'proposed', addressType, address });
  } catch (error) {
    console.error('Address update error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/**
 * Driver confirms or rejects the proposed address update.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { action } = await req.json() as { action: 'confirm' | 'reject' };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, status, proposed_address_update
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can respond to address updates' }, { status: 403 });
    }

    const proposed = ride.proposed_address_update as { addressType: string; address: string; latitude: number; longitude: number } | null;
    if (!proposed) {
      return NextResponse.json({ error: 'No pending address update' }, { status: 400 });
    }

    if (action === 'confirm') {
      // Apply the address update to the ride
      if (proposed.addressType === 'pickup') {
        await sql`
          UPDATE rides SET
            pickup_address = ${proposed.address},
            pickup_lat = ${proposed.latitude},
            pickup_lng = ${proposed.longitude},
            proposed_address_update = NULL,
            updated_at = NOW()
          WHERE id = ${rideId}
        `;
      } else {
        await sql`
          UPDATE rides SET
            dropoff_address = ${proposed.address},
            dropoff_lat = ${proposed.latitude},
            dropoff_lng = ${proposed.longitude},
            proposed_address_update = NULL,
            updated_at = NOW()
          WHERE id = ${rideId}
        `;
      }

      await publishRideUpdate(rideId, 'address_update_confirmed', {
        addressType: proposed.addressType,
        address: proposed.address,
        latitude: proposed.latitude,
        longitude: proposed.longitude,
      }).catch(() => {});

      await notifyUser(ride.rider_id as string, 'address_update_confirmed', {
        rideId,
        addressType: proposed.addressType,
        address: proposed.address,
        message: `Driver confirmed your new ${proposed.addressType}: ${proposed.address}`,
      }).catch(() => {});

      return NextResponse.json({ status: 'confirmed', addressType: proposed.addressType, address: proposed.address });
    } else {
      // Reject — clear the proposal
      await sql`
        UPDATE rides SET
          proposed_address_update = NULL,
          updated_at = NOW()
        WHERE id = ${rideId}
      `;

      await publishRideUpdate(rideId, 'address_update_rejected', {
        addressType: proposed.addressType,
      }).catch(() => {});

      await notifyUser(ride.rider_id as string, 'address_update_rejected', {
        rideId,
        addressType: proposed.addressType,
        message: 'Driver kept the original address',
      }).catch(() => {});

      return NextResponse.json({ status: 'rejected' });
    }
  } catch (error) {
    console.error('Address update response error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
