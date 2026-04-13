import { stripe } from '@/lib/stripe/connect';
import { sql } from '@/lib/db/client';
import { calculateFullBreakdown, getDailyEarnings } from './fee-calculator';
import { getDriverEnrollment, updateEnrollmentProgress, isDriverInFreeWindow, getOfferProgress } from '@/lib/db/enrollment-offers';
import { calculateAddOnTotal } from '@/lib/db/service-menu';

const isMock = process.env.STRIPE_MOCK === 'true';

// Backwards-compat stubs
export function calculateFare(..._args: unknown[]) { return { amount: 0, total: 0, baseFare: 0, distanceFee: 0, durationFee: 0, timeFee: 0, currency: 'usd' }; }
export function createEscrow(..._args: unknown[]) { return Promise.resolve('mock_escrow'); }
export function validateEscrowParams(..._args: unknown[]) { return true; }

/**
 * Hold rider payment via Direct Charge on driver's connected account.
 * Uses manual capture (escrow hold) — funds are authorized but not captured.
 * application_fee_amount is set at capture time (when ride ends).
 */
export async function holdRiderPayment(params: {
  rideId: string;
  agreedPrice: number;
  addOnReserve?: number;
  stripeCustomerId: string;
  paymentMethodId: string;
  driverStripeAccountId: string;
  riderId: string;
  driverId: string;
}): Promise<{ paymentIntentId: string; status: string }> {
  const reserve = params.addOnReserve ?? 0;
  const totalHold = params.agreedPrice + reserve;
  const amountInCents = Math.round(totalHold * 100);

  if (isMock) {
    const mockId = 'pi_mock_' + Date.now();
    await sql`
      UPDATE rides SET
        payment_intent_id = ${mockId},
        funds_held = true,
        payment_authorized = true,
        payment_authorized_at = NOW(),
        final_agreed_price = ${params.agreedPrice},
        add_on_reserve = ${reserve}
      WHERE id = ${params.rideId}
    `;
    await insertLedger(params.rideId, params.riderId, 'rider', 'payment_hold', totalHold, 'hold', `Ride payment held (base: $${params.agreedPrice}, add-on reserve: $${reserve})`, mockId);
    await insertLedger(params.rideId, params.driverId, 'driver', 'payment_pending', totalHold, 'pending', 'Incoming ride payment pending', mockId);
    return { paymentIntentId: mockId, status: 'requires_capture' };
  }

  // Clone the rider's payment method to the connected account for Direct Charges
  const clonedPm = await stripe.paymentMethods.create({
    customer: params.stripeCustomerId,
    payment_method: params.paymentMethodId,
  }, {
    stripeAccount: params.driverStripeAccountId,
  });

  // Create a customer on the connected account to attach the cloned PM
  const connectedCustomer = await stripe.customers.create({
    payment_method: clonedPm.id,
    metadata: { platformCustomerId: params.stripeCustomerId, riderId: params.riderId },
  }, {
    stripeAccount: params.driverStripeAccountId,
  });

  // Direct Charge: PaymentIntent created ON the connected account
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    customer: connectedCustomer.id,
    payment_method: clonedPm.id,
    capture_method: 'manual',
    confirm: true,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    statement_descriptor_suffix: 'HMU RIDE',
    metadata: {
      rideId: params.rideId,
      riderId: params.riderId,
      driverId: params.driverId,
      platformCustomerId: params.stripeCustomerId,
    },
  }, {
    stripeAccount: params.driverStripeAccountId,
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
      add_on_reserve = ${reserve}
    WHERE id = ${params.rideId}
  `;

  await insertLedger(params.rideId, params.riderId, 'rider', 'payment_hold', totalHold, 'hold', `Ride payment held (base: $${params.agreedPrice}, add-on reserve: $${reserve})`, paymentIntent.id);
  await insertLedger(params.rideId, params.driverId, 'driver', 'payment_pending', totalHold, 'pending', 'Incoming ride payment pending', paymentIntent.id);

  return { paymentIntentId: paymentIntent.id, status: paymentIntent.status };
}

/**
 * Capture the held payment on the driver's connected account.
 * application_fee_amount = platform's cut (transferred to platform account).
 * Stripe processing fee is deducted from the connected account by Stripe.
 */
export async function captureRiderPayment(rideId: string): Promise<{
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
    SELECT payment_intent_id, final_agreed_price, driver_id, rider_id
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
  const breakdown = calculateFullBreakdown(
    totalRideAmount,
    tier as 'free' | 'hmu_first',
    (driver?.payout_method as string) || 'bank',
    earnings.cumulativeDailyEarnings,
    earnings.dailyFeePaid,
    earnings.weeklyFeePaid
  );

  // Check enrollment offer — driver may be in free window
  const inFreeWindow = await isDriverInFreeWindow(ride.driver_id as string);
  const normalFee = breakdown.platformFee;
  const actualFee = inFreeWindow ? 0 : normalFee;
  const waivedFee = inFreeWindow ? normalFee : 0;

  // application_fee = platform fee only (Stripe fee is absorbed by connected account)
  const applicationFeeCents = Math.round(actualFee * 100);

  // Capture amount = base + confirmed add-ons (may be less than original hold if add-ons removed)
  const captureAmountCents = Math.round(totalRideAmount * 100);

  if (!isMock && ride.payment_intent_id && driverStripeAccountId) {
    await stripe.paymentIntents.capture(
      ride.payment_intent_id as string,
      {
        amount_to_capture: captureAmountCents,
        application_fee_amount: applicationFeeCents,
      },
      {
        stripeAccount: driverStripeAccountId,
        idempotencyKey: `capture_${rideId}`,
      }
    );
  }

  // Calculate driver receives with actual fee (0 if in free window)
  const driverReceives = inFreeWindow
    ? Math.round((breakdown.netAfterStripe) * 100) / 100
    : breakdown.driverReceives;
  const platformReceives = inFreeWindow
    ? Math.round(breakdown.stripeFee * 100) / 100
    : breakdown.platformReceives;

  await sql`
    UPDATE rides SET
      payment_captured = true,
      payment_captured_at = NOW(),
      platform_fee_amount = ${actualFee},
      driver_payout_amount = ${driverReceives},
      stripe_fee_amount = ${breakdown.stripeFee},
      waived_fee_amount = ${waivedFee},
      add_on_total = ${addOnTotal},
      status = 'completed'
    WHERE id = ${rideId}
  `;

  // Upsert daily earnings (with actual fee, not waived)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const weekStart = getWeekStart(today);
  await sql`
    INSERT INTO daily_earnings (driver_id, earnings_date, week_start_date, gross_earnings, platform_fee_paid, rides_completed, daily_cap_hit)
    VALUES (${ride.driver_id}, ${today}, ${weekStart}, ${totalRideAmount}, ${actualFee}, 1, ${!inFreeWindow && breakdown.dailyCapHit})
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
    capHit: !inFreeWindow && breakdown.dailyCapHit,
    waivedFee,
    offerActive: inFreeWindow,
    offerProgress,
    offerJustExhausted,
  };
}

/**
 * Cancel the payment hold (release authorized funds).
 */
export async function cancelPaymentHold(rideId: string, reason: string): Promise<void> {
  const rideRows = await sql`
    SELECT payment_intent_id, final_agreed_price, rider_id, driver_id
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return;
  const ride = rideRows[0] as Record<string, unknown>;

  if (!isMock && ride.payment_intent_id) {
    // Get driver's stripe account for Direct Charge cancel
    const driverRows = await sql`
      SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
    `;
    const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;

    if (driverStripeId) {
      await stripe.paymentIntents.cancel(
        ride.payment_intent_id as string,
        {},
        {
          stripeAccount: driverStripeId,
          idempotencyKey: `cancel_${rideId}`,
        }
      );
    }
  }

  await sql`UPDATE rides SET funds_held = false, status = 'cancelled' WHERE id = ${rideId}`;
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

  const driverRows = await sql`
    SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
  `;
  const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;

  if (!isMock && ride.payment_intent_id && driverStripeId) {
    const captureAmountCents = Math.round(captureTotal * 100);
    const applicationFeeCents = Math.round(platformAmount * 100);

    await stripe.paymentIntents.capture(
      ride.payment_intent_id as string,
      {
        amount_to_capture: captureAmountCents,
        application_fee_amount: applicationFeeCents,
      },
      {
        stripeAccount: driverStripeId,
        idempotencyKey: `cancel_deposit_${rideId}`,
      }
    );
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
    const driverRows = await sql`
      SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
    `;
    const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;

    if (driverStripeId) {
      await stripe.refunds.create(
        { payment_intent: ride.payment_intent_id as string },
        {
          stripeAccount: driverStripeId,
          idempotencyKey: `refund_${rideId}`,
        }
      );
    }
  }

  await sql`UPDATE rides SET status = 'refunded' WHERE id = ${rideId}`;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'refund', Number(ride.final_agreed_price || 0), 'credit', 'Refund: ' + reason, ride.payment_intent_id as string);
}

/**
 * Partial capture for no-show: capture a percentage of the base fare,
 * refund add-ons 100%. Platform takes a cut of the captured amount.
 *
 * @param noShowPercent - 25 or 50
 * No-show fee split:
 *   25% → driver gets 25%, platform gets 5%, rider refunded 70%
 *   50% → driver gets 50%, platform gets 10%, rider refunded 40%
 */
export async function partialCaptureNoShow(
  rideId: string,
  noShowPercent: 25 | 50
): Promise<{
  captured: number;
  driverReceives: number;
  platformReceives: number;
  riderRefunded: number;
  addOnRefunded: number;
}> {
  const rideRows = await sql`
    SELECT payment_intent_id, final_agreed_price, add_on_reserve, driver_id, rider_id, is_cash
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
  const addOnReserve = Number(ride.add_on_reserve || 0);

  // Calculate no-show amounts
  const platformPercent = noShowPercent === 25 ? 5 : 10;
  const driverAmount = Math.round(baseFare * (noShowPercent / 100) * 100) / 100;
  const platformAmount = Math.round(baseFare * (platformPercent / 100) * 100) / 100;
  const captureTotal = driverAmount + platformAmount;
  const riderRefunded = baseFare - captureTotal;

  // Get driver's Stripe account
  const driverRows = await sql`
    SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id} LIMIT 1
  `;
  const driverStripeId = (driverRows[0] as Record<string, unknown>)?.stripe_account_id as string;

  if (!isMock && ride.payment_intent_id && driverStripeId) {
    const captureAmountCents = Math.round(captureTotal * 100);
    const applicationFeeCents = Math.round(platformAmount * 100);
    const idempotencyKey = `noshow_${rideId}_${noShowPercent}`;

    // Partial capture: only capture the no-show fee portion
    await stripe.paymentIntents.capture(
      ride.payment_intent_id as string,
      {
        amount_to_capture: captureAmountCents,
        application_fee_amount: applicationFeeCents,
      },
      {
        stripeAccount: driverStripeId,
        idempotencyKey,
      }
    );
  }

  // Update ride record
  await sql`
    UPDATE rides SET
      status = 'ended',
      payment_captured = true,
      payment_captured_at = NOW(),
      no_show_percent = ${noShowPercent},
      no_show_base_charge = ${captureTotal},
      no_show_addon_refund = ${addOnReserve},
      platform_fee_amount = ${platformAmount},
      driver_payout_amount = ${driverAmount},
      ended_at = NOW(),
      updated_at = NOW()
    WHERE id = ${rideId}
  `;

  // Ledger entries
  const piId = ride.payment_intent_id as string;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'no_show_charge', captureTotal, 'debit',
    `No-show ${noShowPercent}% charge ($${captureTotal.toFixed(2)})`, piId);
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'no_show_refund', riderRefunded, 'credit',
    `No-show partial refund ($${riderRefunded.toFixed(2)})`, piId);
  if (addOnReserve > 0) {
    await insertLedger(rideId, ride.rider_id as string, 'rider', 'addon_refund', addOnReserve, 'credit',
      `Add-ons fully refunded on no-show ($${addOnReserve.toFixed(2)})`, piId);
  }
  await insertLedger(rideId, ride.driver_id as string, 'driver', 'no_show_earnings', driverAmount, 'credit',
    `No-show fee: ${noShowPercent}% of $${baseFare.toFixed(2)}`, piId);
  await insertLedger(rideId, ride.driver_id as string, 'platform', 'no_show_platform_fee', platformAmount, 'credit',
    `Platform no-show fee: ${platformPercent}%`, piId);

  return {
    captured: captureTotal,
    driverReceives: driverAmount,
    platformReceives: platformAmount,
    riderRefunded: riderRefunded + addOnReserve,
    addOnRefunded: addOnReserve,
  };
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
