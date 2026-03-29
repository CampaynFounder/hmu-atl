import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { holdRiderPayment } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { getDriverMenuForRider } from '@/lib/db/service-menu';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const { lat, lng, locationText, validatedPickup, validatedDropoff, validatedStops } = body as {
      lat?: number;
      lng?: number;
      locationText?: string;
      validatedPickup?: { address: string; name: string; latitude: number; longitude: number; mapbox_id: string };
      validatedDropoff?: { address: string; name: string; latitude: number; longitude: number; mapbox_id: string };
      validatedStops?: { address: string; name: string; latitude: number; longitude: number; mapbox_id: string; order: number }[];
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

    // Calculate add-on reserve based on driver's menu
    let addOnReserve = 0;
    try {
      const driverMenu = await getDriverMenuForRider(ride.driver_id as string);
      if (driverMenu.length > 0) {
        const menuTotal = driverMenu.reduce((sum, item) => sum + Number(item.price ?? 0), 0);
        // Reserve = menu total capped at $50 or 25% of ride price, whichever is greater
        addOnReserve = Math.min(menuTotal, Math.max(50, agreedPrice * 0.25));
        addOnReserve = Math.round(addOnReserve * 100) / 100;
      }
    } catch {
      // Non-critical — proceed without reserve
    }

    // Hold the payment (base + add-on reserve)
    // If the full hold (base + reserve) fails, retry with base only.
    // Rider just won't have extras available — but they can still ride.
    try {
      await holdRiderPayment({
        rideId,
        agreedPrice,
        addOnReserve,
        stripeCustomerId,
        paymentMethodId,
        driverStripeAccountId,
        riderId: userId,
        driverId: ride.driver_id as string,
      });
    } catch (e) {
      if (addOnReserve > 0) {
        // Retry without the add-on reserve — card may only cover the ride
        console.warn('Full hold failed, retrying without add-on reserve:', e);
        try {
          await holdRiderPayment({
            rideId,
            agreedPrice,
            addOnReserve: 0,
            stripeCustomerId,
            paymentMethodId,
            driverStripeAccountId,
            riderId: userId,
            driverId: ride.driver_id as string,
          });
          addOnReserve = 0; // Reset so DB reflects no reserve
        } catch (e2) {
          console.error('Payment hold failed (no reserve):', e2);
          const msg = e2 instanceof Error ? e2.message : 'Payment failed';
          return NextResponse.json({ error: `Payment hold failed: ${msg}`, code: 'payment_failed' }, { status: 402 });
        }
      } else {
        console.error('Payment hold failed:', e);
        const msg = e instanceof Error ? e.message : 'Payment failed';
        return NextResponse.json({ error: `Payment hold failed: ${msg}`, code: 'payment_failed' }, { status: 402 });
      }
    }
    } // end if (!isCashRide)

    // Prepare validated stops as JSONB (with reached_at/verified fields for tracking)
    const stopsJson = validatedStops?.length
      ? JSON.stringify(validatedStops.map(s => ({ ...s, reached_at: null, verified: false })))
      : null;

    // Update ride with rider location, validated addresses, and COO status
    await sql`
      UPDATE rides SET
        coo_at = NOW(),
        rider_lat = ${lat || null},
        rider_lng = ${lng || null},
        rider_location_text = ${locationText || null},
        pickup_address = ${validatedPickup?.address || locationText || null},
        pickup_lat = ${validatedPickup?.latitude || null},
        pickup_lng = ${validatedPickup?.longitude || null},
        dropoff_address = ${validatedDropoff?.address || null},
        dropoff_lat = ${validatedDropoff?.latitude || null},
        dropoff_lng = ${validatedDropoff?.longitude || null},
        stops = ${stopsJson}::jsonb,
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'matched'
    `;

    // Notify driver with rider's location + validated addresses
    await publishRideUpdate(rideId, 'coo', {
      status: 'coo',
      riderLat: lat,
      riderLng: lng,
      riderLocation: locationText,
      pickup: validatedPickup || null,
      dropoff: validatedDropoff || null,
      stops: validatedStops || null,
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

    // SMS driver that rider is payment ready
    try {
      const [driverPhoneRows, riderHandleRows] = await Promise.all([
        sql`SELECT phone FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1`,
        sql`SELECT COALESCE(handle, display_name, 'Rider') as name FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`,
      ]);
      const driverPhone = (driverPhoneRows[0] as Record<string, unknown>)?.phone as string;
      const riderName = (riderHandleRows[0] as Record<string, unknown>)?.name as string;
      if (driverPhone) {
        const dst = driverPhone.replace(/\D/g, '').replace(/^1/, '');
        const smsMsg = `HMU: ${riderName} is payment ready. Log in to let them know you're OTW. atl.hmucashride.com/ride/${rideId}`;
        const smsParams = new URLSearchParams({
          api_username: process.env.VOIPMS_API_USERNAME || '',
          api_password: process.env.VOIPMS_API_PASSWORD || '',
          method: 'sendSMS',
          did: process.env.VOIPMS_DID_ATL || '',
          dst,
          message: smsMsg.length > 160 ? smsMsg.slice(0, 157) + '...' : smsMsg,
        });
        fetch(`https://voip.ms/api/v1/rest.php?${smsParams.toString()}`).catch(() => {});
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({ status: 'coo', rideId, paymentHeld: true });
  } catch (error) {
    console.error('COO error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
