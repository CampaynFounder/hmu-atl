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
  requestAddOnRemoval,
  confirmAddOnRemoval,
  rejectAddOnRemoval,
} from '@/lib/db/service-menu';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

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

    // Total doesn't change yet — item is pending_driver confirmation
    const total = await calculateAddOnTotal(rideId);

    // Notify driver that rider wants to add an item — driver must confirm
    publishRideUpdate(rideId, 'add_on_pending', {
      addOn: { id: addOn.id, name: addOn.name, subtotal: addOn.subtotal, quantity: addOn.quantity, status: 'pending_driver' },
      addOnTotal: total,
    }).catch(() => {});

    if (ride.driver_id && ride.driver_id !== userId) {
      notifyUser(ride.driver_id as string, 'ride_update', {
        rideId,
        type: 'add_on_pending',
        addOn: { id: addOn.id, name: addOn.name, subtotal: addOn.subtotal },
        message: `Rider wants to add: ${addOn.name} ($${Number(addOn.subtotal || 0).toFixed(2)}) — tap to confirm`,
      }).catch(() => {});
    }

    return NextResponse.json({ addOn, total }, { status: 201 });
  } catch (error) {
    console.error('Add ride add-on error:', error);
    return NextResponse.json({ error: 'Failed to add service' }, { status: 500 });
  }
}

// PATCH — rider or driver manages add-ons
// Driver actions: confirm, reject, confirm_removal, reject_removal, confirm_all
// Rider actions: request_removal, disputed
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

    // Look up user
    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = userRows[0].id;

    // Verify user is part of this ride
    const rideRows = await sql`SELECT rider_id, driver_id FROM rides WHERE id = ${rideId} LIMIT 1`;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    const isRider = ride.rider_id === userId;
    const isDriver = ride.driver_id === userId;
    if (!isRider && !isDriver) {
      return NextResponse.json({ error: 'Not authorized for this ride' }, { status: 403 });
    }

    const otherPartyId = isRider ? ride.driver_id as string : ride.rider_id as string;

    // ── DRIVER ACTIONS ──
    if (isDriver) {
      if (action === 'confirm' && add_on_id) {
        // Driver confirms a pending add-on → it now counts toward total
        await updateAddOnStatus(add_on_id, 'confirmed');
        publishRideUpdate(rideId, 'add_on_confirmed', { addOnId: add_on_id }).catch(() => {});
        notifyUser(otherPartyId, 'ride_update', {
          rideId, type: 'add_on_confirmed',
          message: 'Driver confirmed your add-on',
        }).catch(() => {});

      } else if (action === 'reject' && add_on_id) {
        // Driver rejects a pending add-on → rider notified, $0
        await updateAddOnStatus(add_on_id, 'rejected');
        publishRideUpdate(rideId, 'add_on_rejected', { addOnId: add_on_id }).catch(() => {});
        notifyUser(otherPartyId, 'ride_update', {
          rideId, type: 'add_on_rejected',
          message: 'Driver declined your add-on request',
        }).catch(() => {});

      } else if (action === 'confirm_removal' && add_on_id) {
        // Driver approves rider's removal request → item removed, $0
        await confirmAddOnRemoval(add_on_id, rideId);
        publishRideUpdate(rideId, 'add_on_removed', { addOnId: add_on_id }).catch(() => {});
        notifyUser(otherPartyId, 'ride_update', {
          rideId, type: 'add_on_removed',
          message: 'Driver approved your removal request',
        }).catch(() => {});

      } else if (action === 'reject_removal' && add_on_id) {
        // Driver rejects removal → item stays confirmed
        await rejectAddOnRemoval(add_on_id, rideId);
        publishRideUpdate(rideId, 'removal_rejected', { addOnId: add_on_id }).catch(() => {});
        notifyUser(otherPartyId, 'ride_update', {
          rideId, type: 'removal_rejected',
          message: 'Driver declined your removal request — you can dispute this',
        }).catch(() => {});

      } else if (action === 'confirm_all') {
        // Driver confirms all pending add-ons at once
        await confirmAllAddOns(rideId);
        publishRideUpdate(rideId, 'add_ons_confirmed_all', {}).catch(() => {});
        notifyUser(otherPartyId, 'ride_update', {
          rideId, type: 'add_ons_confirmed_all',
          message: 'Driver confirmed all add-ons',
        }).catch(() => {});

      } else {
        return NextResponse.json({ error: 'Invalid driver action' }, { status: 400 });
      }
    }

    // ── RIDER ACTIONS ──
    if (isRider) {
      if (action === 'request_removal' && add_on_id) {
        // Rider requests removal of a confirmed item → driver must approve
        const result = await requestAddOnRemoval(add_on_id, rideId);
        if (!result) {
          return NextResponse.json({ error: 'Can only request removal of confirmed add-ons' }, { status: 400 });
        }
        publishRideUpdate(rideId, 'removal_requested', {
          addOnId: add_on_id,
          addOn: { id: result.id, name: result.name, subtotal: result.subtotal },
        }).catch(() => {});
        notifyUser(otherPartyId, 'ride_update', {
          rideId, type: 'removal_requested',
          addOn: { id: result.id, name: result.name, subtotal: result.subtotal },
          message: `Rider wants to remove: ${result.name} (-$${Number(result.subtotal || 0).toFixed(2)}) — tap to confirm`,
        }).catch(() => {});

      } else if (action === 'disputed' && add_on_id) {
        // Rider disputes an add-on (e.g. after driver rejects their removal)
        await updateAddOnStatus(add_on_id, 'disputed', adjusted_amount, dispute_reason);
        publishRideUpdate(rideId, 'add_on_disputed', {
          addOnId: add_on_id,
          reason: dispute_reason || 'Rider disputes this add-on',
        }).catch(() => {});
        notifyUser(otherPartyId, 'ride_update', {
          rideId, type: 'add_on_disputed',
          message: 'Rider is disputing an add-on charge',
        }).catch(() => {});

      } else {
        return NextResponse.json({ error: 'Invalid rider action' }, { status: 400 });
      }
    }

    // Recalculate total (only confirmed + adjusted items count)
    const total = await calculateAddOnTotal(rideId);
    await sql`UPDATE rides SET add_on_total = ${total} WHERE id = ${rideId}`;

    const addOns = await getRideAddOns(rideId);
    return NextResponse.json({ addOns, total });
  } catch (error) {
    console.error('Update ride add-on error:', error);
    return NextResponse.json({ error: 'Failed to update add-on' }, { status: 500 });
  }
}
