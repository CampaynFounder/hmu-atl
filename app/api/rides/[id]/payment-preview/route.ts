import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { resolvePricingStrategy } from '@/lib/payments/strategies';

/**
 * Pre-Pull-Up payment preview. The rider's UI calls this to know which
 * pricing mode the driver is on and what split to show:
 *
 *   legacy_full_fare → deposit ≈ visible_deposit, cashRemainder = 0
 *                       (the full fare is captured at Start Ride from the auth)
 *   deposit_only     → deposit = driver's floor (clamped), cashRemainder = fare - deposit
 *                       (rider must bring the cash on arrival)
 *
 * Pure read — never mutates anything. Safe to poll.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: rideId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  const ride = await getRideForUser(rideId, userId);
  if (!ride) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });

  if (ride.is_cash) {
    return NextResponse.json({
      mode: 'cash',
      modeKey: 'cash',
      agreedPrice: Number(ride.final_agreed_price ?? ride.amount ?? 0),
      visibleDeposit: 0,
      cashRemainder: Number(ride.final_agreed_price ?? ride.amount ?? 0),
      holdMode: 'cash',
      requiresCashOnHandConfirm: false,
    });
  }

  const driverFloorRows = await sql`SELECT deposit_floor, payout_method FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1`;
  const driverFloor = (driverFloorRows[0] as Record<string, unknown>)?.deposit_floor as number | null | undefined;
  const selectedDeposit = driverFloor != null ? Number(driverFloor) : undefined;

  const driverTierRows = await sql`SELECT tier FROM users WHERE id = ${ride.driver_id} LIMIT 1`;
  const driverTier = ((driverTierRows[0] as Record<string, unknown>)?.tier as string) || 'free';

  const agreedPrice = Number(ride.final_agreed_price ?? ride.amount ?? 0);

  const strategy = await resolvePricingStrategy(ride.driver_id as string);
  const decision = await strategy.calculateHold({
    driverId: ride.driver_id as string,
    riderId: userId,
    driverTier: driverTier as 'free' | 'hmu_first',
    agreedPrice,
    addOnReserve: 0, // preview ignores add-on buffer
    selectedDeposit,
  });

  const visibleDeposit = decision.visibleDeposit;
  const cashRemainder = strategy.modeKey === 'deposit_only'
    ? Math.max(0, agreedPrice - visibleDeposit)
    : 0;

  return NextResponse.json({
    mode: strategy.displayName,
    modeKey: strategy.modeKey,
    agreedPrice,
    visibleDeposit,
    cashRemainder,
    holdMode: decision.holdMode,
    // Hard-gate flag: deposit_only requires the rider to confirm cash on hand.
    requiresCashOnHandConfirm: strategy.modeKey === 'deposit_only' && cashRemainder > 0,
  });
}
