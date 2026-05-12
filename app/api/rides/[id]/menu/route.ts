// Ride Menu API — fetch driver's service menu in the context of an active ride
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getDriverMenuForRider } from '@/lib/db/service-menu';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Get ride + verify user is the rider
    const rideRows = await sql`
      SELECT rider_id, driver_id, status, add_on_reserve, add_on_total, is_cash, pricing_mode_key
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can view the menu' }, { status: 403 });
    }

    // Mirror the allowed-status list on the POST add-ons handler. Riders
    // can browse + queue extras from the moment they're matched (or even
    // pending/accepted, before authorizing the deposit) — the per-extra
    // Stripe capture doesn't fire until the driver confirms during the
    // ride, by which point the rider's saved PM is on file from Pull Up.
    const allowedStatuses = ['pending', 'accepted', 'matched', 'otw', 'here', 'confirming', 'active', 'in_progress'];
    if (!allowedStatuses.includes(ride.status as string)) {
      return NextResponse.json({ error: 'Menu not available for this ride status' }, { status: 400 });
    }

    const menu = await getDriverMenuForRider(ride.driver_id as string);
    const reserve = Number(ride.add_on_reserve ?? 0);
    const currentTotal = Number(ride.add_on_total ?? 0);
    const remaining = Math.max(0, reserve - currentTotal);
    const pricingModeKey = (ride.pricing_mode_key as string) || null;
    // Reserve gating only applies to modes that pre-authorize an add-on
    // reserve at hold time (legacy_full_fare). deposit_only charges each
    // extra as its own destination charge at driver-confirm time, so the
    // rider can queue items even when reserve === 0. Cash rides bypass
    // Stripe entirely.
    const requiresReserve = pricingModeKey === 'legacy_full_fare' && !ride.is_cash;

    return NextResponse.json({
      menu,
      reserve,
      currentTotal,
      remaining,
      isCash: !!(ride.is_cash),
      pricingModeKey,
      requiresReserve,
    });
  } catch (error) {
    console.error('Ride menu error:', error);
    return NextResponse.json({ error: 'Failed to load menu' }, { status: 500 });
  }
}
