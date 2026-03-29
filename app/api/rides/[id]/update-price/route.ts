import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

/**
 * Driver proposes a new price after seeing stops/itinerary.
 * Only allowed in 'matched' status (before OTW).
 * Rider must accept or decline via Ably.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { newPrice, reason } = await req.json() as { newPrice: number; reason?: string };

    if (!newPrice || newPrice < 1) {
      return NextResponse.json({ error: 'Price must be at least $1' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, status, amount, final_agreed_price
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can update the price' }, { status: 403 });
    }

    if (ride.status !== 'matched') {
      return NextResponse.json({ error: 'Price can only be updated before going OTW' }, { status: 400 });
    }

    const oldPrice = Number(ride.final_agreed_price || ride.amount || 0);

    // Store proposed price — ride stays at old price until rider accepts
    await sql`
      UPDATE rides SET
        proposed_price = ${newPrice},
        proposed_price_reason = ${reason || null},
        updated_at = NOW()
      WHERE id = ${rideId}
    `;

    // Notify rider via Ably
    await publishRideUpdate(rideId, 'price_update_proposed', {
      oldPrice,
      newPrice,
      reason: reason || null,
    }).catch(() => {});

    await notifyUser(ride.rider_id as string, 'price_update', {
      rideId,
      oldPrice,
      newPrice,
      reason: reason || null,
      message: `Driver updated the price to $${newPrice}`,
    }).catch(() => {});

    return NextResponse.json({ status: 'proposed', oldPrice, newPrice });
  } catch (error) {
    console.error('Update price error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/**
 * Rider accepts or declines the proposed price.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { action } = await req.json() as { action: 'accept' | 'decline' };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT rider_id, driver_id, status, proposed_price, amount, final_agreed_price
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can respond to price updates' }, { status: 403 });
    }

    const proposedPrice = Number(ride.proposed_price);
    if (!proposedPrice) {
      return NextResponse.json({ error: 'No pending price proposal' }, { status: 400 });
    }

    if (action === 'accept') {
      await sql`
        UPDATE rides SET
          amount = ${proposedPrice},
          final_agreed_price = ${proposedPrice},
          proposed_price = NULL,
          proposed_price_reason = NULL,
          updated_at = NOW()
        WHERE id = ${rideId}
      `;

      await publishRideUpdate(rideId, 'price_update_accepted', {
        newPrice: proposedPrice,
      }).catch(() => {});

      return NextResponse.json({ status: 'accepted', newPrice: proposedPrice });
    } else {
      // Decline — clear proposal, keep original price
      await sql`
        UPDATE rides SET
          proposed_price = NULL,
          proposed_price_reason = NULL,
          updated_at = NOW()
        WHERE id = ${rideId}
      `;

      await publishRideUpdate(rideId, 'price_update_declined', {
        proposedPrice,
        keptPrice: Number(ride.final_agreed_price || ride.amount),
      }).catch(() => {});

      return NextResponse.json({ status: 'declined', keptPrice: Number(ride.final_agreed_price || ride.amount) });
    }
  } catch (error) {
    console.error('Price response error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
