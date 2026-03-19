import { stripe } from '@/lib/stripe/connect';
import { sql } from '@/lib/db/client';
import { calculateFullBreakdown, getDailyEarnings } from './fee-calculator';

const isMock = process.env.STRIPE_MOCK === 'true';

// Backwards-compat stubs
export function calculateFare(..._args: unknown[]) { return { amount: 0, total: 0, baseFare: 0, distanceFee: 0, durationFee: 0, timeFee: 0, currency: 'usd' }; }
export function createEscrow(..._args: unknown[]) { return Promise.resolve('mock_escrow'); }
export function validateEscrowParams(..._args: unknown[]) { return true; }

export async function holdRiderPayment(params: {
  rideId: string;
  agreedPrice: number;
  stripeCustomerId: string;
  paymentMethodId: string;
  driverStripeAccountId: string;
  riderId: string;
  driverId: string;
}): Promise<{ paymentIntentId: string; status: string }> {
  const amountInCents = Math.round(params.agreedPrice * 100);

  if (isMock) {
    const mockId = 'pi_mock_' + Date.now();
    await sql`
      UPDATE rides SET
        payment_intent_id = ${mockId},
        funds_held = true,
        payment_authorized = true,
        payment_authorized_at = NOW(),
        final_agreed_price = ${params.agreedPrice}
      WHERE id = ${params.rideId}
    `;
    await insertLedger(params.rideId, params.riderId, 'rider', 'payment_hold', params.agreedPrice, 'hold', 'Ride payment held', mockId);
    await insertLedger(params.rideId, params.driverId, 'driver', 'payment_pending', params.agreedPrice, 'pending', 'Incoming ride payment pending', mockId);
    return { paymentIntentId: mockId, status: 'requires_capture' };
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    customer: params.stripeCustomerId,
    payment_method: params.paymentMethodId,
    capture_method: 'manual',
    confirm: true,
    transfer_data: { destination: params.driverStripeAccountId },
    statement_descriptor_suffix: 'RIDE',
    metadata: { rideId: params.rideId, riderId: params.riderId, driverId: params.driverId },
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
      final_agreed_price = ${params.agreedPrice}
    WHERE id = ${params.rideId}
  `;

  await insertLedger(params.rideId, params.riderId, 'rider', 'payment_hold', params.agreedPrice, 'hold', 'Ride payment held', paymentIntent.id);
  await insertLedger(params.rideId, params.driverId, 'driver', 'payment_pending', params.agreedPrice, 'pending', 'Incoming ride payment pending', paymentIntent.id);

  return { paymentIntentId: paymentIntent.id, status: paymentIntent.status };
}

export async function captureRiderPayment(rideId: string): Promise<{
  driverReceives: number;
  platformReceives: number;
  capHit: boolean;
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

  const userRows = await sql`SELECT tier FROM users WHERE id = ${ride.driver_id} LIMIT 1`;
  const tier = ((userRows[0] as Record<string, unknown>)?.tier as string) || 'free';

  const earnings = await getDailyEarnings(ride.driver_id as string);
  const breakdown = calculateFullBreakdown(
    Number(ride.final_agreed_price),
    tier as 'free' | 'hmu_first',
    (driver?.payout_method as string) || 'bank',
    earnings.cumulativeDailyEarnings,
    earnings.dailyFeePaid,
    earnings.weeklyFeePaid
  );

  const platformFeeInCents = Math.round(breakdown.platformFee * 100);

  if (!isMock) {
    await stripe.paymentIntents.capture(ride.payment_intent_id as string, {
      application_fee_amount: platformFeeInCents,
    });
  }

  await sql`
    UPDATE rides SET
      payment_captured = true,
      payment_captured_at = NOW(),
      platform_fee_amount = ${breakdown.platformFee},
      driver_payout_amount = ${breakdown.driverReceives},
      stripe_fee_amount = ${breakdown.stripeFee},
      status = 'completed'
    WHERE id = ${rideId}
  `;

  // Upsert daily earnings
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const weekStart = getWeekStart(today);
  await sql`
    INSERT INTO daily_earnings (driver_id, earnings_date, week_start_date, gross_earnings, platform_fee_paid, rides_completed, daily_cap_hit)
    VALUES (${ride.driver_id}, ${today}, ${weekStart}, ${Number(ride.final_agreed_price)}, ${breakdown.platformFee}, 1, ${breakdown.dailyCapHit})
    ON CONFLICT (driver_id, earnings_date)
    DO UPDATE SET
      gross_earnings = daily_earnings.gross_earnings + EXCLUDED.gross_earnings,
      platform_fee_paid = daily_earnings.platform_fee_paid + EXCLUDED.platform_fee_paid,
      rides_completed = daily_earnings.rides_completed + 1,
      daily_cap_hit = EXCLUDED.daily_cap_hit,
      updated_at = NOW()
  `;

  await insertLedger(rideId, ride.rider_id as string, 'rider', 'payment_captured', Number(ride.final_agreed_price), 'debit', 'Ride payment charged', ride.payment_intent_id as string);
  await insertLedger(rideId, ride.driver_id as string, 'driver', 'earnings', breakdown.driverReceives, 'credit', 'Ride earnings', ride.payment_intent_id as string);
  await insertLedger(rideId, ride.driver_id as string, 'platform', 'platform_fee', breakdown.platformFee, 'credit', 'Platform fee', ride.payment_intent_id as string);

  return { driverReceives: breakdown.driverReceives, platformReceives: breakdown.platformReceives, capHit: breakdown.dailyCapHit };
}

export async function cancelPaymentHold(rideId: string, reason: string): Promise<void> {
  const rideRows = await sql`
    SELECT payment_intent_id, final_agreed_price, rider_id, driver_id
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return;
  const ride = rideRows[0] as Record<string, unknown>;

  if (!isMock && ride.payment_intent_id) {
    await stripe.paymentIntents.cancel(ride.payment_intent_id as string);
  }

  await sql`UPDATE rides SET funds_held = false, status = 'cancelled' WHERE id = ${rideId}`;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'hold_released', Number(ride.final_agreed_price || 0), 'release', 'Payment hold released: ' + reason, ride.payment_intent_id as string);
}

export async function refundRider(rideId: string, reason: string): Promise<void> {
  const rideRows = await sql`
    SELECT payment_intent_id, payment_captured, final_agreed_price, rider_id
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return;
  const ride = rideRows[0] as Record<string, unknown>;

  if (!ride.payment_captured) {
    await cancelPaymentHold(rideId, reason);
    return;
  }

  if (!isMock && ride.payment_intent_id) {
    await stripe.refunds.create({ payment_intent: ride.payment_intent_id as string });
  }

  await sql`UPDATE rides SET status = 'refunded' WHERE id = ${rideId}`;
  await insertLedger(rideId, ride.rider_id as string, 'rider', 'refund', Number(ride.final_agreed_price || 0), 'credit', 'Refund: ' + reason, ride.payment_intent_id as string);
}

async function insertLedger(
  rideId: string, userId: string, userRole: string,
  eventType: string, amount: number, direction: string,
  description: string, stripeReference: string | null
) {
  await sql`
    INSERT INTO transaction_ledger (ride_id, user_id, user_role, event_type, amount, direction, description, stripe_reference)
    VALUES (${rideId}, ${userId}, ${userRole}, ${eventType}, ${amount}, ${direction}, ${description}, ${stripeReference})
  `;
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}
