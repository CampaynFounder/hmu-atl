import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { captureRiderPayment } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { isWithinProximity } from '@/lib/geo/distance';
import { calculateAndStoreRideAnalytics } from '@/lib/rides/analytics';
import { getDriverEnrollment, updateEnrollmentProgress, isDriverInFreeWindow } from '@/lib/db/enrollment-offers';
import Stripe from 'stripe';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    let driverLat: number | null = null;
    let driverLng: number | null = null;
    let earlyEndReason: string | null = null;
    let earlyEndNotes: string | null = null;
    try {
      const body = await req.json();
      driverLat = body.driverLat || null;
      driverLng = body.driverLng || null;
      earlyEndReason = body.earlyEndReason || null;
      earlyEndNotes = body.earlyEndNotes || null;
    } catch { /* no body is ok */ }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can end the ride' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'ended')) {
      return NextResponse.json({ error: `Cannot end ride from status: ${ride.status}` }, { status: 400 });
    }

    const disputeMinutes = Number(ride.dispute_window_minutes || process.env.DISPUTE_WINDOW_MINUTES || 15);

    // Payment is captured at ride START (confirm-start), not end.
    // Only capture here as fallback if somehow missed (legacy rides).
    let payoutResult = { driverReceives: 0, platformReceives: 0, capHit: false };
    const isCashRide = !!(ride.is_cash);

    if (!isCashRide && ride.payment_intent_id && ride.funds_held && !ride.payment_captured) {
      try {
        payoutResult = await captureRiderPayment(rideId);
      } catch (e) {
        console.error('Payment capture failed:', e);
      }
    } else if (ride.payment_captured) {
      // Already captured at confirm-start — use stored values
      payoutResult = {
        driverReceives: Number(ride.driver_payout_amount || 0),
        platformReceives: Number(ride.platform_fee_amount || 0),
        capHit: false,
      };
    }

    // Decrement cash ride counter for cash rides (non-HMU First)
    if (isCashRide) {
      try {
        const tierRows = await sql`SELECT tier FROM users WHERE id = ${userId} LIMIT 1`;
        const tier = (tierRows[0] as Record<string, unknown>)?.tier as string;

        if (tier !== 'hmu_first') {
          // Monthly reset check — reset if past 1st of current month
          const resetRows = await sql`
            SELECT cash_rides_reset_at FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
          `;
          const resetAt = (resetRows[0] as Record<string, unknown>)?.cash_rides_reset_at as string;
          const now = new Date();
          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          if (resetAt && new Date(resetAt) < firstOfMonth) {
            // Reset free rides for the new month
            await sql`
              UPDATE driver_profiles SET
                cash_rides_remaining = 3,
                cash_rides_reset_at = ${firstOfMonth.toISOString()}
              WHERE user_id = ${userId}
            `;
          }

          // Deduct: pack balance first, then free remaining
          await sql`
            UPDATE driver_profiles SET
              cash_pack_balance = CASE
                WHEN cash_pack_balance > 0 THEN cash_pack_balance - 1
                ELSE cash_pack_balance
              END,
              cash_rides_remaining = CASE
                WHEN cash_pack_balance <= 0 AND cash_rides_remaining > 0 THEN cash_rides_remaining - 1
                ELSE cash_rides_remaining
              END
            WHERE user_id = ${userId}
          `;
        }
      } catch (e) {
        console.error('Cash ride counter decrement failed:', e);
      }

      // Track cash ride in launch offer enrollment (gross: ride + add-ons)
      try {
        const cashGross = Number(ride.final_agreed_price || ride.amount || 0) + Number(ride.add_on_total || 0);
        const enrollment = await getDriverEnrollment(userId);
        if (enrollment && await isDriverInFreeWindow(userId)) {
          await updateEnrollmentProgress(userId, cashGross, 0);
        }
      } catch (e) {
        console.error('Launch offer update for cash ride failed:', e);
      }
    }

    // Geo-verify: is driver near validated dropoff address?
    let endProximityFt: number | null = null;
    let endVerified: boolean | null = null;
    if (driverLat && driverLng && ride.dropoff_lat && ride.dropoff_lng) {
      const result = isWithinProximity(
        { latitude: driverLat, longitude: driverLng },
        { latitude: Number(ride.dropoff_lat), longitude: Number(ride.dropoff_lng) }
      );
      endProximityFt = result.distanceFeet;
      endVerified = result.within;
    }

    await sql`
      UPDATE rides SET
        status = 'ended',
        ended_at = NOW(),
        driver_confirmed_end = true,
        driver_end_lat = ${driverLat},
        driver_end_lng = ${driverLng},
        end_proximity_ft = ${endProximityFt},
        end_verified = ${endVerified},
        early_end_reason = ${earlyEndReason},
        early_end_notes = ${earlyEndNotes},
        dispute_window_expires_at = NOW() + ${disputeMinutes + ' minutes'}::interval,
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'active'
    `;

    // Calculate ride analytics (non-blocking)
    calculateAndStoreRideAnalytics(rideId).catch(() => {});

    // Post stays 'matched' during ended/dispute phase
    // Rating endpoint will set it to 'completed'

    await publishRideUpdate(rideId, 'status_change', {
      status: 'ended',
      message: 'Ride ended',
      driverReceives: payoutResult.driverReceives,
      disputeWindowMinutes: disputeMinutes,
    }).catch(() => {});
    await notifyUser(ride.rider_id as string, 'ride_update', {
      rideId, status: 'ended', message: 'Ride complete — rate your driver',
    }).catch(() => {});
    publishAdminEvent('ride_status_change', {
      rideId, status: 'ended', endVerified,
      driverReceives: payoutResult.driverReceives,
      platformFee: payoutResult.platformReceives,
    }).catch(() => {});

    // ── Phase 2: Auto-instant payout for HMU First drivers ──
    if (payoutResult.driverReceives > 0) {
      try {
        const tierRows = await sql`
          SELECT u.tier, dp.stripe_account_id
          FROM users u
          JOIN driver_profiles dp ON dp.user_id = u.id
          WHERE u.id = ${userId} LIMIT 1
        `;
        const driverInfo = tierRows[0] as { tier: string; stripe_account_id: string | null } | undefined;

        if (driverInfo?.tier === 'hmu_first' && driverInfo.stripe_account_id && process.env.STRIPE_MOCK !== 'true') {
          const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
            httpClient: Stripe.createFetchHttpClient(),
          });
          const balance = await stripeClient.balance.retrieve({ stripeAccount: driverInfo.stripe_account_id });
          const available = balance.available.reduce((sum, b) => sum + b.amount, 0);

          if (available > 0) {
            await stripeClient.payouts.create(
              { amount: available, currency: 'usd', method: 'instant' },
              { stripeAccount: driverInfo.stripe_account_id }
            ).catch(() => {
              // Instant not available — fall back to standard
              return stripeClient.payouts.create(
                { amount: available, currency: 'usd', method: 'standard' },
                { stripeAccount: driverInfo.stripe_account_id! }
              );
            });
          }
        }
      } catch (e) {
        console.error('Auto-payout failed (non-blocking):', e);
      }
    }

    return NextResponse.json({
      status: 'ended',
      rideId,
      disputeWindowMinutes: disputeMinutes,
      driverReceives: payoutResult.driverReceives,
      platformFee: payoutResult.platformReceives,
      capHit: payoutResult.capHit,
    });
  } catch (error) {
    console.error('End ride error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
