import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { holdRiderPayment } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const { lat, lng, locationText } = body as {
      lat?: number;
      lng?: number;
      locationText?: string;
    };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can send COO' }, { status: 403 });
    }

    if (ride.status !== 'matched') {
      return NextResponse.json({ error: `Cannot COO from status: ${ride.status}` }, { status: 400 });
    }

    // ── Skip payment hold for cash rides ──
    const isCashRide = !!(ride.is_cash);

    if (!isCashRide) {
    // ── Payment hold: authorize the agreed amount on rider's card ──
    // Get rider's payment method and driver's Stripe account
    const [riderPmRows, driverRows, riderProfileRows] = await Promise.all([
      sql`SELECT stripe_payment_method_id FROM rider_payment_methods WHERE rider_id = ${userId} AND is_default = true LIMIT 1`,
      sql`SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1`,
      sql`SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`,
    ]);

    const paymentMethodId = (riderPmRows[0] as Record<string, unknown>)?.stripe_payment_method_id as string;
    const driverStripeAccountId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;
    const stripeCustomerId = (riderProfileRows[0] as Record<string, unknown>)?.stripe_customer_id as string;

    if (!paymentMethodId || !stripeCustomerId) {
      return NextResponse.json({ error: 'No payment method linked. Add a payment method first.', code: 'no_payment_method' }, { status: 400 });
    }

    if (!driverStripeAccountId) {
      return NextResponse.json({ error: 'Driver has not set up payouts yet', code: 'driver_no_payout' }, { status: 400 });
    }

    const agreedPrice = Number(ride.final_agreed_price || ride.amount || 0);
    if (agreedPrice <= 0) {
      return NextResponse.json({ error: 'No agreed price for this ride' }, { status: 400 });
    }

    // Hold the payment
    try {
      await holdRiderPayment({
        rideId,
        agreedPrice,
        stripeCustomerId,
        paymentMethodId,
        driverStripeAccountId,
        riderId: userId,
        driverId: ride.driver_id as string,
      });
    } catch (e) {
      console.error('Payment hold failed:', e);
      const msg = e instanceof Error ? e.message : 'Payment failed';
      return NextResponse.json({ error: `Payment hold failed: ${msg}`, code: 'payment_failed' }, { status: 402 });
    }
    } // end if (!isCashRide)

    // Update ride with rider location and COO status
    await sql`
      UPDATE rides SET
        coo_at = NOW(),
        rider_lat = ${lat || null},
        rider_lng = ${lng || null},
        rider_location_text = ${locationText || null},
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'matched'
    `;

    // Notify driver with rider's location
    await publishRideUpdate(rideId, 'coo', {
      status: 'coo',
      riderLat: lat,
      riderLng: lng,
      riderLocation: locationText,
      message: 'Rider is ready — COO! Payment authorized.',
    }).catch(() => {});

    await notifyUser(ride.driver_id as string, 'ride_update', {
      rideId,
      status: 'coo',
      riderLat: lat,
      riderLng: lng,
      riderLocation: locationText,
      message: 'Rider says COO — payment ready, location shared',
    }).catch(() => {});

    return NextResponse.json({ status: 'coo', rideId, paymentHeld: true });
  } catch (error) {
    console.error('COO error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
