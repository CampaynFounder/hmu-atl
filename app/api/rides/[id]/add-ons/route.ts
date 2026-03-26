// Ride Add-Ons API
// Rider adds/removes/confirms service items for a ride

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import {
  addRideAddOn,
  getRideAddOns,
  updateAddOnStatus,
  removeRideAddOn,
  confirmAllAddOns,
  calculateAddOnTotal,
  getDriverMenuForRider,
} from '@/lib/db/service-menu';
import { publishRideUpdate } from '@/lib/ably/server';

// GET — list add-ons for a ride
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    // Verify user is part of this ride
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

    const addOns = await getRideAddOns(rideId);
    const total = await calculateAddOnTotal(rideId);

    return NextResponse.json({ addOns, total });
  } catch (error) {
    console.error('Get ride add-ons error:', error);
    return NextResponse.json({ error: 'Failed to get add-ons' }, { status: 500 });
  }
}

// POST — rider adds an item from driver's menu
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await request.json();
    const { menu_item_id, quantity = 1 } = body;

    if (!menu_item_id) {
      return NextResponse.json({ error: 'menu_item_id required' }, { status: 400 });
    }

    // Verify user is the rider for this ride
    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = userRows[0].id;

    const rideRows = await sql`
      SELECT rider_id, driver_id, status, add_on_reserve, add_on_total, is_cash
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can add services' }, { status: 403 });
    }

    // Only allow adding during active ride states
    const allowedStatuses = ['pending', 'accepted', 'matched', 'otw', 'here', 'active', 'in_progress'];
    if (!allowedStatuses.includes(ride.status as string)) {
      return NextResponse.json({ error: 'Cannot add services to a completed ride' }, { status: 400 });
    }

    // Check add-on reserve (skip for cash rides)
    const isCash = !!(ride.is_cash);
    if (!isCash) {
      const reserve = Number(ride.add_on_reserve ?? 0);
      const currentTotal = Number(ride.add_on_total ?? 0);

      // Look up the item price to check if it fits within the reserve
      const driverMenu = await getDriverMenuForRider(ride.driver_id as string);
      const menuItem = driverMenu.find(m => m.id === menu_item_id);
      const itemCost = menuItem ? Number(menuItem.price) * quantity : 0;

      if (reserve > 0 && currentTotal + itemCost > reserve) {
        const remaining = Math.max(0, reserve - currentTotal);
        return NextResponse.json({
          error: 'add_on_limit',
          message: `Add-on total would exceed the held amount. You have $${remaining.toFixed(2)} available for extras.`,
          remaining,
        }, { status: 400 });
      }
    }

    const addOn = await addRideAddOn(rideId, menu_item_id, quantity);

    // Update ride add-on total
    const total = await calculateAddOnTotal(rideId);
    await sql`UPDATE rides SET add_on_total = ${total} WHERE id = ${rideId}`;

    // Notify both parties via Ably
    publishRideUpdate(rideId, 'add_on_added', {
      addOn: { id: addOn.id, name: addOn.name, subtotal: addOn.subtotal, quantity: addOn.quantity },
      addOnTotal: total,
    }).catch(() => {});

    return NextResponse.json({ addOn, total }, { status: 201 });
  } catch (error) {
    console.error('Add ride add-on error:', error);
    return NextResponse.json({ error: 'Failed to add service' }, { status: 500 });
  }
}

// PATCH — rider confirms, adjusts, disputes, or removes add-ons
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await request.json();
    const { add_on_id, action, adjusted_amount, dispute_reason } = body;

    // Verify user is the rider
    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = userRows[0].id;

    const rideRows = await sql`SELECT rider_id FROM rides WHERE id = ${rideId} LIMIT 1`;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    if ((rideRows[0] as Record<string, unknown>).rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can modify add-ons' }, { status: 403 });
    }

    // Determine if user is driver or rider
    const isDriver = (rideRows[0] as Record<string, unknown>).rider_id !== userId;

    if (action === 'confirm_all') {
      await confirmAllAddOns(rideId);
    } else if (action === 'remove' && add_on_id) {
      if (!isDriver) {
        // Rider tried to remove — convert to a dispute instead
        await updateAddOnStatus(add_on_id, 'disputed', undefined, 'Rider requested removal');
        publishRideUpdate(rideId, 'add_on_disputed', {
          addOnId: add_on_id,
          reason: 'Rider requested removal',
        }).catch(() => {});
        const total = await calculateAddOnTotal(rideId);
        await sql`UPDATE rides SET add_on_total = ${total} WHERE id = ${rideId}`;
        const addOns = await getRideAddOns(rideId);
        return NextResponse.json({
          addOns,
          total,
          message: 'Removal requested — your driver will review this.',
        });
      }
      await removeRideAddOn(add_on_id, rideId);
      // Notify rider that driver approved removal
      publishRideUpdate(rideId, 'add_on_removed', { addOnId: add_on_id }).catch(() => {});
    } else if (action === 'disputed' && add_on_id) {
      await updateAddOnStatus(add_on_id, action, adjusted_amount, dispute_reason);
      // Notify driver about the dispute
      const rideData = rideRows[0] as Record<string, unknown>;
      const driverId = rideData.rider_id === userId ? rideData.driver_id : rideData.rider_id;
      publishRideUpdate(rideId, 'add_on_disputed', {
        addOnId: add_on_id,
        reason: dispute_reason || 'Rider disputes this add-on',
      }).catch(() => {});
    } else if (add_on_id && action) {
      await updateAddOnStatus(add_on_id, action, adjusted_amount, dispute_reason);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Recalculate total
    const total = await calculateAddOnTotal(rideId);
    await sql`UPDATE rides SET add_on_total = ${total} WHERE id = ${rideId}`;

    const addOns = await getRideAddOns(rideId);
    return NextResponse.json({ addOns, total });
  } catch (error) {
    console.error('Update ride add-on error:', error);
    return NextResponse.json({ error: 'Failed to update add-on' }, { status: 500 });
  }
}
