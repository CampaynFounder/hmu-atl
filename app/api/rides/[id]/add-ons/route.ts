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
} from '@/lib/db/service-menu';

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
      SELECT rider_id, driver_id, status FROM rides WHERE id = ${rideId} LIMIT 1
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

    const addOn = await addRideAddOn(rideId, menu_item_id, quantity);

    // Update ride add-on total
    const total = await calculateAddOnTotal(rideId);
    await sql`UPDATE rides SET add_on_total = ${total} WHERE id = ${rideId}`;

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

    if (action === 'confirm_all') {
      await confirmAllAddOns(rideId);
    } else if (action === 'remove' && add_on_id) {
      await removeRideAddOn(add_on_id, rideId);
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
