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
    stripeAccount: params.driverStripeAccountId,  // ← Direct Charge
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
      { stripeAccount: driverStripeAccountId }
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
    const { enrollment, justExhausted } = await updateEnrollmentProgress(
      ride.driver_id as string,
      driverReceives,
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
        { stripeAccount: driverStripeId }
      );
    }
  }

  await sql`UPDATE rides SET funds_held = false, status = 'cancelled' WHERE id = ${rideId}`;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'hold_released', Number(ride.final_agreed_price || 0), 'release', 'Payment hold released: ' + reason, ride.payment_intent_id as string);
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
        { stripeAccount: driverStripeId }
      );
    }
  }

  await sql`UPDATE rides SET status = 'refunded' WHERE id = ${rideId}`;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'refund', Number(ride.final_agreed_price || 0), 'credit', 'Refund: ' + reason, ride.payment_intent_id as string);
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
