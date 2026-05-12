import { stripe } from '@/lib/stripe/connect';
import { sql } from '@/lib/db/client';
import { getDailyEarnings } from './fee-calculator';
import { getDriverEnrollment, updateEnrollmentProgress, isDriverInFreeWindow, getOfferProgress } from '@/lib/db/enrollment-offers';
import { calculateAddOnTotal } from '@/lib/db/service-menu';
import { resolvePricingStrategy } from './strategies';
import type { PricingStrategy } from './strategies';
import { getDepositOnlyConfig, calculateExtrasFeeCents } from './strategies/deposit-only';

const isMock = process.env.STRIPE_MOCK === 'true';

/**
 * Returns true if a Stripe error indicates the PaymentIntent doesn't exist
 * on the platform account — meaning it's a legacy Direct-Charge PI that lives
 * on the driver's connected sub-account. We use this to retry the operation
 * on the sub-account so existing in-flight rides don't break across the
 * Direct → Destination Charges migration.
 */
function isLegacyDirectChargeError(err: unknown): boolean {
  const e = err as { code?: string; type?: string; statusCode?: number } | null;
  if (!e || typeof e !== 'object') return false;
  return e.code === 'resource_missing' || (e.type === 'StripeInvalidRequestError' && e.statusCode === 404);
}

// Backwards-compat stubs
export function calculateFare(..._args: unknown[]) { return { amount: 0, total: 0, baseFare: 0, distanceFee: 0, durationFee: 0, timeFee: 0, currency: 'usd' }; }
export function createEscrow(..._args: unknown[]) { return Promise.resolve('mock_escrow'); }
export function validateEscrowParams(..._args: unknown[]) { return true; }

/**
 * Hold rider payment via Direct Charge on driver's connected account.
 * Uses manual capture (escrow hold) — funds are authorized but not captured.
 *
 * The strategy controls HOW MUCH is authorized:
 *   - legacy_full_fare: full ride price + add-on reserve
 *   - deposit_only: just the rider-selected deposit
 * Pass `strategy` explicitly in tests; production path resolves from cohort.
 */
export async function holdRiderPayment(params: {
  rideId: string;
  agreedPrice: number;
  addOnReserve?: number;
  selectedDeposit?: number;
  stripeCustomerId: string;
  paymentMethodId: string;
  driverStripeAccountId: string;
  riderId: string;
  driverId: string;
  driverTier?: 'free' | 'hmu_first';
}, options?: { strategy?: PricingStrategy }): Promise<{ paymentIntentId: string; status: string; visibleDeposit: number; authorizedAmount: number }> {
  const reserve = params.addOnReserve ?? 0;

  const strategy = options?.strategy ?? await resolvePricingStrategy(params.driverId);
  const holdDecision = await strategy.calculateHold({
    driverId: params.driverId,
    riderId: params.riderId,
    driverTier: params.driverTier ?? 'free',
    agreedPrice: params.agreedPrice,
    addOnReserve: reserve,
    selectedDeposit: params.selectedDeposit,
  });

  const amountInCents = holdDecision.authorizeAmountCents;
  const totalHold = amountInCents / 100;
  const visibleDeposit = holdDecision.visibleDeposit;

  if (isMock) {
    const mockId = 'pi_mock_' + Date.now();
    await sql`
      UPDATE rides SET
        payment_intent_id = ${mockId},
        funds_held = true,
        payment_authorized = true,
        payment_authorized_at = NOW(),
        final_agreed_price = ${params.agreedPrice},
        add_on_reserve = ${reserve},
        visible_deposit = ${visibleDeposit},
        pricing_mode_key = ${strategy.modeKey}
      WHERE id = ${params.rideId}
    `;
    await insertLedger(params.rideId, params.riderId, 'rider', 'payment_hold', totalHold, 'hold', `Ride payment held (mode: ${holdDecision.holdMode}, authorized: $${totalHold.toFixed(2)}, visible deposit: $${visibleDeposit.toFixed(2)})`, mockId);
    await insertLedger(params.rideId, params.driverId, 'driver', 'payment_pending', totalHold, 'pending', 'Incoming ride payment pending', mockId);
    return { paymentIntentId: mockId, status: 'requires_capture', visibleDeposit, authorizedAmount: totalHold };
  }

  // Destination Charge: PaymentIntent on the PLATFORM account using the
  // rider's saved PM (which lives on the platform). transfer_data.destination
  // routes the funds to the driver's Connect account at capture time, with
  // application_fee_amount kept by the platform.
  //
  // This is the architecture locked in CLAUDE.md and in the Stripe account
  // configuration. We previously cloned the rider's PM to the driver's
  // sub-account (Direct Charges) which broke for Cash App Pay / Affirm /
  // Klarna / Afterpay — those PMs cannot be shared cross-account.
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    customer: params.stripeCustomerId,
    payment_method: params.paymentMethodId,
    capture_method: 'manual',
    confirm: true,
    off_session: true,
    transfer_data: { destination: params.driverStripeAccountId },
    statement_descriptor_suffix: 'HMU RIDE',
    metadata: {
      rideId: params.rideId,
      riderId: params.riderId,
      driverId: params.driverId,
      pricingMode: holdDecision.holdMode,
    },
  }, {
    idempotencyKey: `hold_${params.rideId}`,
  });

  if (paymentIntent.status !== 'requires_capture') {
    throw new Error(`Payment authorization failed: ${paymentIntent.status}`);
  }

  await sql`
    UPDATE rides SET
      payment_intent_id = ${paymentIntent.id},
      funds_held = true,
      payment_authorized = true,
      payment_authorized_at = NOW(),
      final_agreed_price = ${params.agreedPrice},
      add_on_reserve = ${reserve},
      visible_deposit = ${visibleDeposit},
      pricing_mode_key = ${strategy.modeKey}
    WHERE id = ${params.rideId}
  `;

  await insertLedger(params.rideId, params.riderId, 'rider', 'payment_hold', totalHold, 'hold', `Ride payment held (mode: ${holdDecision.holdMode}, authorized: $${totalHold.toFixed(2)}, visible deposit: $${visibleDeposit.toFixed(2)})`, paymentIntent.id);
  await insertLedger(params.rideId, params.driverId, 'driver', 'payment_pending', totalHold, 'pending', 'Incoming ride payment pending', paymentIntent.id);

  return { paymentIntentId: paymentIntent.id, status: paymentIntent.status, visibleDeposit, authorizedAmount: totalHold };
}

/**
 * Capture the held payment on the driver's connected account.
 * application_fee_amount = platform's cut (transferred to platform account).
 * Stripe processing fee is deducted from the connected account by Stripe.
 */
export async function captureRiderPayment(rideId: string, options?: { strategy?: PricingStrategy }): Promise<{
  driverReceives: number;
  platformReceives: number;
  capHit: boolean;
  waivedFee: number;
  offerActive: boolean;
  offerProgress: {
    ridesRemaining: number;
    ridesTotal: number;
    earningsRemaining: number;
    earningsTotal: number;
    daysRemaining: number;
    expiresAt: Date;
    totalSaved: number;
  } | null;
  offerJustExhausted: boolean;
}> {
  const rideRows = await sql`
    SELECT payment_intent_id, final_agreed_price, visible_deposit, driver_id, rider_id
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) throw new Error('Ride not found');
  const ride = rideRows[0] as Record<string, unknown>;

  const driverRows = await sql`
    SELECT stripe_account_id, payout_method FROM driver_profiles
    WHERE user_id = ${ride.driver_id} LIMIT 1
  `;
  const driver = driverRows[0] as Record<string, unknown>;
  const driverStripeAccountId = driver?.stripe_account_id as string;

  const userRows = await sql`SELECT tier FROM users WHERE id = ${ride.driver_id} LIMIT 1`;
  const tier = ((userRows[0] as Record<string, unknown>)?.tier as string) || 'free';

  // Calculate confirmed add-on total
  const addOnTotal = await calculateAddOnTotal(rideId);
  const totalRideAmount = Number(ride.final_agreed_price) + addOnTotal;

  const earnings = await getDailyEarnings(ride.driver_id as string);

  // Check enrollment offer — driver may be in free window
  const inFreeWindow = await isDriverInFreeWindow(ride.driver_id as string);

  // Resolve pricing strategy and let it decide capture amount + fee.
  const strategy = options?.strategy ?? await resolvePricingStrategy(ride.driver_id as string);
  const decision = await strategy.calculateCapture({
    driverId: ride.driver_id as string,
    rideId,
    agreedPrice: Number(ride.final_agreed_price),
    addOnTotal,
    visibleDeposit: Number(ride.visible_deposit ?? 0),
    driverTier: tier as 'free' | 'hmu_first',
    driverPayoutMethod: (driver?.payout_method as string) || 'bank',
    cumulativeDailyEarnings: earnings.cumulativeDailyEarnings,
    dailyFeePaid: earnings.dailyFeePaid,
    weeklyFeePaid: earnings.weeklyFeePaid,
    inFreeWindow,
  });

  const captureAmountCents = decision.captureAmountCents;
  const applicationFeeCents = decision.applicationFeeCents;
  const actualFee = applicationFeeCents / 100;
  const waivedFee = decision.waivedFee;
  const driverReceives = decision.driverReceives;
  const platformReceives = decision.platformReceives;

  if (!isMock && ride.payment_intent_id && driverStripeAccountId) {
    // Destination Charge capture — runs on the platform account. The PI's
    // transfer_data.destination already routes funds to the driver Connect
    // account; application_fee_amount is what the platform keeps.
    //
    // Legacy fallback: rides authorized under the old Direct-Charge code path
    // have their PI on the driver's sub-account; capture there returns 200
    // and resource_missing on platform. Retry with {stripeAccount} on miss.
    const args = {
      amount_to_capture: captureAmountCents,
      application_fee_amount: applicationFeeCents,
    };
    try {
      await stripe.paymentIntents.capture(
        ride.payment_intent_id as string,
        args,
        { idempotencyKey: `capture_${rideId}` },
      );
    } catch (err) {
      if (isLegacyDirectChargeError(err)) {
        await stripe.paymentIntents.capture(
          ride.payment_intent_id as string,
          args,
          { stripeAccount: driverStripeAccountId, idempotencyKey: `capture_${rideId}` },
        );
      } else {
        throw err;
      }
    }
  }

  // Capture is a money-movement primitive; the ride status transition is
  // owned by the caller. Previously this UPDATE set status='completed', but
  // capture now fires at Start Ride (per money_movement_canonical /
  // deposit_only_launch_model — both LOCKED 2026-05-07), so 'completed' was
  // wrong: confirm-start's subsequent `WHERE status='confirming'` UPDATE
  // silently no-op'd, the ride sat at 'completed' for its whole active
  // phase, and End Ride later 400'd because validateTransition rejects
  // completed→ended. Net effect: rides got stuck mid-flow with no way out.
  await sql`
    UPDATE rides SET
      payment_captured = true,
      payment_captured_at = NOW(),
      platform_fee_amount = ${actualFee},
      driver_payout_amount = ${driverReceives},
      stripe_fee_amount = ${decision.stripeFee},
      waived_fee_amount = ${waivedFee},
      add_on_total = ${addOnTotal}
    WHERE id = ${rideId}
  `;

  // Upsert daily earnings (with actual fee, not waived). Track full ride
  // amount as gross even in deposit_only mode — this powers earnings dashboards
  // regardless of how much we actually captured on-platform.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const weekStart = getWeekStart(today);
  await sql`
    INSERT INTO daily_earnings (driver_id, earnings_date, week_start_date, gross_earnings, platform_fee_paid, rides_completed, daily_cap_hit)
    VALUES (${ride.driver_id}, ${today}, ${weekStart}, ${totalRideAmount}, ${actualFee}, 1, ${decision.dailyCapHit})
    ON CONFLICT (driver_id, earnings_date)
    DO UPDATE SET
      gross_earnings = daily_earnings.gross_earnings + EXCLUDED.gross_earnings,
      platform_fee_paid = daily_earnings.platform_fee_paid + EXCLUDED.platform_fee_paid,
      rides_completed = daily_earnings.rides_completed + 1,
      daily_cap_hit = EXCLUDED.daily_cap_hit,
      updated_at = NOW()
  `;

  // Update enrollment progress if in free window
  let offerProgress = null;
  let offerJustExhausted = false;
  if (inFreeWindow) {
    // Track gross ride amount (base + add-ons) for consistent launch offer accounting
    const { enrollment, justExhausted } = await updateEnrollmentProgress(
      ride.driver_id as string,
      totalRideAmount,
      waivedFee
    );
    offerJustExhausted = justExhausted;
    offerProgress = getOfferProgress(enrollment);
  }

  await insertLedger(rideId, ride.rider_id as string, 'rider', 'payment_captured', Number(ride.final_agreed_price), 'debit', 'Ride payment charged', ride.payment_intent_id as string);
  await insertLedger(rideId, ride.driver_id as string, 'driver', 'earnings', driverReceives, 'credit', inFreeWindow ? 'Ride earnings (Launch Offer — $0 fee)' : 'Ride earnings', ride.payment_intent_id as string);
  if (actualFee > 0) {
    await insertLedger(rideId, ride.driver_id as string, 'platform', 'platform_fee', actualFee, 'credit', 'Platform fee', ride.payment_intent_id as string);
  }
  if (waivedFee > 0) {
    await insertLedger(rideId, ride.driver_id as string, 'platform', 'fee_waived', waivedFee, 'waiver', 'Launch Offer — fee waived', ride.payment_intent_id as string);
  }

  return {
    driverReceives,
    platformReceives,
    capHit: decision.dailyCapHit,
    waivedFee,
    offerActive: inFreeWindow,
    offerProgress,
    offerJustExhausted,
  };
}

/**
 * Cancel the payment hold (release authorized funds).
 *
 * Money-movement primitive ONLY — does NOT flip rides.status. The caller
 * is responsible for the status transition via cascadeRideCancel (which
 * publishes the realtime status_change event so both UIs clean up).
 *
 * Previously this UPDATE set status='cancelled' itself, which raced
 * cascadeRideCancel: cascade's idempotency guard saw status='cancelled'
 * already, returned alreadyCancelled=true, and skipped the Ably publish —
 * leaving cancel-request banners and countdowns stuck open on both sides
 * with no way to clear without a refresh.
 */
export async function cancelPaymentHold(rideId: string, reason: string): Promise<void> {
  const rideRows = await sql`
    SELECT payment_intent_id, final_agreed_price, rider_id, driver_id
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return;
  const ride = rideRows[0] as Record<string, unknown>;

  if (!isMock && ride.payment_intent_id) {
    // Destination Charge cancel — PI lives on the platform. Legacy fallback
    // to {stripeAccount} for pre-migration rides.
    try {
      await stripe.paymentIntents.cancel(
        ride.payment_intent_id as string,
        {},
        { idempotencyKey: `cancel_${rideId}` },
      );
    } catch (err) {
      if (isLegacyDirectChargeError(err)) {
        const driverRows = await sql`
          SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
        `;
        const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;
        if (driverStripeId) {
          await stripe.paymentIntents.cancel(
            ride.payment_intent_id as string,
            {},
            { stripeAccount: driverStripeId, idempotencyKey: `cancel_${rideId}` },
          );
        }
      } else {
        throw err;
      }
    }
  }

  // Status transition is the caller's concern — see comment on this function.
  await sql`UPDATE rides SET funds_held = false WHERE id = ${rideId}`;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'hold_released', Number(ride.final_agreed_price || 0), 'release', 'Payment hold released: ' + reason, ride.payment_intent_id as string);
}

/**
 * Partial capture for voluntary cancellation after OTW.
 * Captures only the deposit split (driver share + platform share).
 * Remainder of the authorization is automatically released by Stripe.
 */
export async function partialCaptureDeposit(
  rideId: string,
  driverAmount: number,
  platformAmount: number
): Promise<void> {
  const rideRows = await sql`
    SELECT payment_intent_id, rider_id, driver_id, visible_deposit
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) throw new Error('Ride not found');
  const ride = rideRows[0] as Record<string, unknown>;

  const captureTotal = driverAmount + platformAmount;
  if (captureTotal <= 0) return;

  if (!isMock && ride.payment_intent_id) {
    const captureAmountCents = Math.round(captureTotal * 100);
    const applicationFeeCents = Math.round(platformAmount * 100);
    const args = {
      amount_to_capture: captureAmountCents,
      application_fee_amount: applicationFeeCents,
    };

    // Destination Charge partial capture; legacy fallback for pre-migration PIs.
    try {
      await stripe.paymentIntents.capture(
        ride.payment_intent_id as string,
        args,
        { idempotencyKey: `cancel_deposit_${rideId}` },
      );
    } catch (err) {
      if (isLegacyDirectChargeError(err)) {
        const driverRows = await sql`
          SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
        `;
        const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;
        if (driverStripeId) {
          await stripe.paymentIntents.capture(
            ride.payment_intent_id as string,
            args,
            { stripeAccount: driverStripeId, idempotencyKey: `cancel_deposit_${rideId}` },
          );
        }
      } else {
        throw err;
      }
    }
  }

  await sql`
    UPDATE rides SET
      payment_captured = true,
      payment_captured_at = NOW(),
      platform_fee_amount = ${platformAmount},
      driver_payout_amount = ${driverAmount},
      funds_held = false
    WHERE id = ${rideId}
  `;

  const piId = ride.payment_intent_id as string;
  const deposit = Number(ride.visible_deposit || captureTotal);
  const riderRefunded = Math.max(0, deposit - captureTotal);
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'cancel_charge', captureTotal, 'debit', `Cancellation fee from deposit ($${captureTotal.toFixed(2)})`, piId);
  if (riderRefunded > 0) {
    await insertLedger(rideId, ride.rider_id as string, 'rider', 'cancel_refund', riderRefunded, 'credit', `Partial deposit refund ($${riderRefunded.toFixed(2)})`, piId);
  }
  await insertLedger(rideId, ride.driver_id as string, 'driver', 'cancel_compensation', driverAmount, 'credit', `Cancellation compensation — gas money ($${driverAmount.toFixed(2)})`, piId);
  if (platformAmount > 0) {
    await insertLedger(rideId, ride.driver_id as string, 'platform', 'cancel_platform_fee', platformAmount, 'credit', 'Platform cancellation fee', piId);
  }
}

/**
 * Refund rider — either release hold (if not captured) or full refund (if captured).
 */
export async function refundRider(rideId: string, reason: string): Promise<void> {
  const rideRows = await sql`
    SELECT payment_intent_id, payment_captured, final_agreed_price, rider_id, driver_id
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return;
  const ride = rideRows[0] as Record<string, unknown>;

  if (!ride.payment_captured) {
    await cancelPaymentHold(rideId, reason);
    return;
  }

  if (!isMock && ride.payment_intent_id) {
    // Destination Charge refund — reverse_transfer pulls funds back from
    // the driver's Connect balance; refund_application_fee pulls back the
    // platform's cut. If the driver already cashed out, Connect balance can
    // go negative — that's the accepted reversal risk per CLAUDE.md.
    //
    // Legacy fallback: pre-migration PIs are on the driver's sub-account.
    // Refund there has different arg shape (no reverse_transfer needed).
    try {
      await stripe.refunds.create(
        {
          payment_intent: ride.payment_intent_id as string,
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `refund_${rideId}` },
      );
    } catch (err) {
      if (isLegacyDirectChargeError(err)) {
        const driverRows = await sql`
          SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
        `;
        const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;
        if (driverStripeId) {
          await stripe.refunds.create(
            { payment_intent: ride.payment_intent_id as string },
            { stripeAccount: driverStripeId, idempotencyKey: `refund_${rideId}` },
          );
        }
      } else {
        throw err;
      }
    }
  }

  await sql`UPDATE rides SET status = 'refunded' WHERE id = ${rideId}`;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'refund', Number(ride.final_agreed_price || 0), 'credit', 'Refund: ' + reason, ride.payment_intent_id as string);
}

/**
 * Partial capture for no-show. Strategy decides how much to capture and what
 * the platform's fee is:
 *   legacy_full_fare: 25% or 50% of base fare; add-ons fully refunded
 *   deposit_only: 100% of deposit minus our fee; no separate add-ons
 */
export async function partialCaptureNoShow(
  rideId: string,
  noShowPercent: number,
  options?: { strategy?: PricingStrategy }
): Promise<{
  captured: number;
  driverReceives: number;
  platformReceives: number;
  riderRefunded: number;
  addOnRefunded: number;
}> {
  const rideRows = await sql`
    SELECT payment_intent_id, final_agreed_price, visible_deposit, add_on_reserve, driver_id, rider_id, is_cash
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) throw new Error('Ride not found');
  const ride = rideRows[0] as Record<string, unknown>;

  // Cash rides: no charge on no-show
  if (ride.is_cash) {
    await sql`UPDATE rides SET status = 'cancelled', no_show_percent = ${noShowPercent} WHERE id = ${rideId}`;
    await insertLedger(rideId, ride.rider_id as string, 'rider', 'no_show_cash', 0, 'none', `No-show (cash ride) — no charge`, null);
    return { captured: 0, driverReceives: 0, platformReceives: 0, riderRefunded: 0, addOnRefunded: 0 };
  }

  const baseFare = Number(ride.final_agreed_price || 0);
  const visibleDeposit = Number(ride.visible_deposit ?? 0);
  const addOnReserve = Number(ride.add_on_reserve || 0);

  const strategy = options?.strategy ?? await resolvePricingStrategy(ride.driver_id as string);
  const decision = await strategy.calculateNoShow({
    driverId: ride.driver_id as string,
    rideId,
    baseFare,
    visibleDeposit,
    addOnReserve,
    noShowPercent,
  });

  const captureTotal = decision.captureAmountCents / 100;
  const driverAmount = decision.driverAmount;
  const platformAmount = decision.platformAmount;
  const riderRefunded = decision.riderRefunded;
  const addOnRefunded = decision.addOnRefunded;

  if (!isMock && ride.payment_intent_id && decision.captureAmountCents > 0) {
    const idempotencyKey = `noshow_${rideId}_${noShowPercent}`;
    const args = {
      amount_to_capture: decision.captureAmountCents,
      application_fee_amount: decision.applicationFeeCents,
    };

    // Destination Charge no-show capture — partial. Stripe auto-releases
    // the unused authorization remainder. Legacy fallback for pre-migration
    // PIs that still live on the driver's sub-account.
    try {
      await stripe.paymentIntents.capture(
        ride.payment_intent_id as string,
        args,
        { idempotencyKey },
      );
    } catch (err) {
      if (isLegacyDirectChargeError(err)) {
        const driverRows = await sql`
          SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
        `;
        const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;
        if (driverStripeId) {
          await stripe.paymentIntents.capture(
            ride.payment_intent_id as string,
            args,
            { stripeAccount: driverStripeId, idempotencyKey },
          );
        }
      } else {
        throw err;
      }
    }
  }

  // Update ride record
  await sql`
    UPDATE rides SET
      status = 'ended',
      payment_captured = true,
      payment_captured_at = NOW(),
      no_show_percent = ${noShowPercent},
      no_show_base_charge = ${captureTotal},
      no_show_addon_refund = ${addOnRefunded},
      platform_fee_amount = ${platformAmount},
      driver_payout_amount = ${driverAmount},
      ended_at = NOW(),
      updated_at = NOW()
    WHERE id = ${rideId}
  `;

  // Ledger entries
  const piId = ride.payment_intent_id as string;
  if (captureTotal > 0) {
    await insertLedger(rideId, ride.rider_id as string, 'rider', 'no_show_charge', captureTotal, 'debit',
      `No-show ${noShowPercent}% charge ($${captureTotal.toFixed(2)})`, piId);
  }
  if (riderRefunded > 0) {
    await insertLedger(rideId, ride.rider_id as string, 'rider', 'no_show_refund', riderRefunded, 'credit',
      `No-show partial refund ($${riderRefunded.toFixed(2)})`, piId);
  }
  if (addOnRefunded > 0) {
    await insertLedger(rideId, ride.rider_id as string, 'rider', 'addon_refund', addOnRefunded, 'credit',
      `Add-ons fully refunded on no-show ($${addOnRefunded.toFixed(2)})`, piId);
  }
  if (driverAmount > 0) {
    await insertLedger(rideId, ride.driver_id as string, 'driver', 'no_show_earnings', driverAmount, 'credit',
      `No-show fee (${strategy.modeKey}): driver receives $${driverAmount.toFixed(2)}`, piId);
  }
  if (platformAmount > 0) {
    await insertLedger(rideId, ride.driver_id as string, 'platform', 'no_show_platform_fee', platformAmount, 'credit',
      `Platform no-show fee: $${platformAmount.toFixed(2)}`, piId);
  }

  return {
    captured: captureTotal,
    driverReceives: driverAmount,
    platformReceives: platformAmount,
    riderRefunded: riderRefunded + addOnRefunded,
    addOnRefunded,
  };
}

/**
 * Per-extra Stripe capture, fired when the driver confirms an add-on.
 *
 * Only runs under the deposit_only pricing strategy — in legacy_full_fare
 * mode extras are covered by the initial add-on reserve and settle at
 * Start Ride, so this function returns `skipped:true` for those rides.
 *
 * On success: row in ride_add_ons gets stripe_payment_intent_id +
 * driver/platform amounts + paid_at; ledger gets debit/credit pair.
 * On failure: row is marked stripe_charge_status='failed' with the
 * Stripe decline code so the driver-confirm UI can surface it.
 */
export type ExtraCaptureResult =
  | { status: 'succeeded'; paymentIntentId: string; driverCents: number; platformFeeCents: number; stripeFeeCents: number }
  | { status: 'failed'; errorCode: string; errorMessage: string }
  | { status: 'skipped'; reason: string };

export async function captureExtraPayment(params: {
  rideId: string;
  addOnId: string;
}): Promise<ExtraCaptureResult> {
  const rideRows = await sql`
    SELECT rider_id, driver_id, is_cash
    FROM rides WHERE id = ${params.rideId} LIMIT 1
  `;
  if (!rideRows.length) return { status: 'skipped', reason: 'ride_not_found' };
  const ride = rideRows[0] as Record<string, unknown>;

  if (ride.is_cash) {
    return { status: 'skipped', reason: 'cash_ride' };
  }

  // Only deposit_only mode does per-extra captures. legacy_full_fare settles
  // extras at the main Start-Ride capture against the add-on reserve.
  const strategy = await resolvePricingStrategy(ride.driver_id as string);
  if (strategy.modeKey !== 'deposit_only') {
    return { status: 'skipped', reason: `strategy_${strategy.modeKey}` };
  }

  const addOnRows = await sql`
    SELECT id, subtotal, status, stripe_payment_intent_id, stripe_charge_status
    FROM ride_add_ons WHERE id = ${params.addOnId} AND ride_id = ${params.rideId} LIMIT 1
  `;
  if (!addOnRows.length) return { status: 'skipped', reason: 'addon_not_found' };
  const addOn = addOnRows[0] as Record<string, unknown>;

  // Idempotency: if we've already succeeded, don't double-charge.
  if (addOn.stripe_charge_status === 'succeeded' && addOn.stripe_payment_intent_id) {
    return {
      status: 'skipped',
      reason: 'already_captured',
    };
  }

  const subtotalCents = Math.round(Number(addOn.subtotal || 0) * 100);
  if (subtotalCents <= 0) {
    return { status: 'skipped', reason: 'zero_amount' };
  }

  // Pull extras fee % from the deposit-only config (admin-tunable).
  const config = await getDepositOnlyConfig();
  const feeCents = calculateExtrasFeeCents(subtotalCents, config);
  const driverCents = subtotalCents - feeCents;

  // Look up the rider's saved PM + customer and the driver's Connect account.
  const [riderPmRows, driverRows, riderProfileRows] = await Promise.all([
    sql`SELECT stripe_payment_method_id FROM rider_payment_methods WHERE rider_id = ${ride.rider_id} AND is_default = true LIMIT 1`,
    sql`SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1`,
    sql`SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${ride.rider_id} LIMIT 1`,
  ]);
  const paymentMethodId = (riderPmRows[0] as Record<string, unknown>)?.stripe_payment_method_id as string | undefined;
  const driverStripeAccountId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string | undefined;
  const stripeCustomerId = (riderProfileRows[0] as Record<string, unknown>)?.stripe_customer_id as string | undefined;

  if (!paymentMethodId || !stripeCustomerId || !driverStripeAccountId) {
    await sql`
      UPDATE ride_add_ons SET
        stripe_charge_status = 'failed',
        error_code = 'missing_payment_setup',
        error_message = 'Rider payment method or driver payout account missing'
      WHERE id = ${params.addOnId}
    `;
    return { status: 'failed', errorCode: 'missing_payment_setup', errorMessage: 'Rider payment or driver payout not set up' };
  }

  if (isMock) {
    const mockPi = `pi_extra_mock_${params.addOnId.slice(0, 8)}`;
    await sql`
      UPDATE ride_add_ons SET
        stripe_payment_intent_id = ${mockPi},
        stripe_charge_status = 'succeeded',
        platform_fee_cents = ${feeCents},
        driver_amount_cents = ${driverCents},
        stripe_fee_cents = ${Math.round(subtotalCents * 0.029) + 30},
        paid_at = NOW()
      WHERE id = ${params.addOnId}
    `;
    await insertLedger(params.rideId, ride.rider_id as string, 'rider', 'extra_charged', subtotalCents / 100, 'debit', `Extra charged (mock)`, mockPi);
    await insertLedger(params.rideId, ride.driver_id as string, 'driver', 'extra_earnings', driverCents / 100, 'credit', 'Extra earnings', mockPi);
    if (feeCents > 0) {
      await insertLedger(params.rideId, ride.driver_id as string, 'platform', 'extra_platform_fee', feeCents / 100, 'credit', 'Platform fee on extra', mockPi);
    }
    return { status: 'succeeded', paymentIntentId: mockPi, driverCents, platformFeeCents: feeCents, stripeFeeCents: Math.round(subtotalCents * 0.029) + 30 };
  }

  try {
    const pi = await stripe.paymentIntents.create({
      amount: subtotalCents,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      application_fee_amount: feeCents,
      transfer_data: { destination: driverStripeAccountId },
      statement_descriptor_suffix: 'HMU EXTRA',
      metadata: {
        rideId: params.rideId,
        addOnId: params.addOnId,
        riderId: ride.rider_id as string,
        driverId: ride.driver_id as string,
        kind: 'extra',
      },
    }, {
      idempotencyKey: `extra_${params.addOnId}`,
    });

    if (pi.status !== 'succeeded') {
      // Card may need step-up auth — surface to driver to retry later.
      await sql`
        UPDATE ride_add_ons SET
          stripe_payment_intent_id = ${pi.id},
          stripe_charge_status = ${pi.status === 'requires_action' ? 'requires_action' : 'failed'},
          error_code = ${pi.status},
          error_message = 'PaymentIntent ended in unexpected status'
        WHERE id = ${params.addOnId}
      `;
      return {
        status: 'failed',
        errorCode: pi.status,
        errorMessage: pi.status === 'requires_action'
          ? 'Card needs verification — rider must re-confirm in the app'
          : `Payment ended in status: ${pi.status}`,
      };
    }

    await sql`
      UPDATE ride_add_ons SET
        stripe_payment_intent_id = ${pi.id},
        stripe_charge_status = 'succeeded',
        platform_fee_cents = ${feeCents},
        driver_amount_cents = ${driverCents},
        stripe_fee_cents = ${Math.round(subtotalCents * 0.029) + 30},
        paid_at = NOW()
      WHERE id = ${params.addOnId}
    `;
    await insertLedger(params.rideId, ride.rider_id as string, 'rider', 'extra_charged', subtotalCents / 100, 'debit', `Extra charged ($${(subtotalCents / 100).toFixed(2)})`, pi.id);
    await insertLedger(params.rideId, ride.driver_id as string, 'driver', 'extra_earnings', driverCents / 100, 'credit', 'Extra earnings', pi.id);
    if (feeCents > 0) {
      await insertLedger(params.rideId, ride.driver_id as string, 'platform', 'extra_platform_fee', feeCents / 100, 'credit', 'Platform fee on extra', pi.id);
    }

    return {
      status: 'succeeded',
      paymentIntentId: pi.id,
      driverCents,
      platformFeeCents: feeCents,
      stripeFeeCents: Math.round(subtotalCents * 0.029) + 30,
    };
  } catch (err: unknown) {
    const e = err as { code?: string; decline_code?: string; message?: string };
    const errorCode = e?.code || 'unknown_error';
    const errorMessage = e?.decline_code
      ? `Card declined: ${e.decline_code}`
      : (e?.message || 'Payment failed');
    await sql`
      UPDATE ride_add_ons SET
        stripe_charge_status = 'failed',
        error_code = ${errorCode},
        error_message = ${errorMessage}
      WHERE id = ${params.addOnId}
    `;
    return { status: 'failed', errorCode, errorMessage };
  }
}

async function insertLedger(
  rideId: string, userId: string, userRole: string,
  eventType: string, amount: number, direction: string,
  description: string, stripeReference: string | null
) {
  try {
    await sql`
      INSERT INTO transaction_ledger (ride_id, user_id, user_role, event_type, amount, direction, description, stripe_reference)
      VALUES (${rideId}, ${userId}, ${userRole}, ${eventType}, ${amount}, ${direction}, ${description}, ${stripeReference})
    `;
  } catch (e) {
    console.error('Ledger insert failed:', e);
  }
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}
