import { stripe } from './connect';
import { sql } from '@/lib/db/client';

const isMock = process.env.STRIPE_MOCK === 'true';

export async function getOrCreateStripeCustomer(rider: {
  id: string;
  email: string;
  clerkId: string;
}): Promise<string> {
  // Check existing
  const rows = await sql`
    SELECT stripe_customer_id FROM rider_profiles
    WHERE user_id = ${rider.id} LIMIT 1
  `;
  const existing = (rows[0] as Record<string, unknown>)?.stripe_customer_id as string | null;
  if (existing) return existing;

  if (isMock) {
    const mockId = 'cus_mock_' + Date.now();
    await sql`UPDATE rider_profiles SET stripe_customer_id = ${mockId} WHERE user_id = ${rider.id}`;
    return mockId;
  }

  const customer = await stripe.customers.create({
    email: rider.email,
    metadata: { riderId: rider.id, clerkId: rider.clerkId },
  });

  await sql`UPDATE rider_profiles SET stripe_customer_id = ${customer.id} WHERE user_id = ${rider.id}`;
  return customer.id;
}

export async function createSetupIntent(stripeCustomerId: string): Promise<string> {
  if (isMock) return 'seti_mock_secret_' + Date.now();

  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
  return setupIntent.client_secret!;
}

export async function savePaymentMethod(
  riderId: string,
  stripeCustomerId: string,
  paymentMethodId: string
): Promise<void> {
  if (!isMock) {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  // Get PM details
  let type = 'card', brand: string | null = 'Visa', last4 = '4242', expMonth: number | null = 12, expYear: number | null = 2030;
  if (!isMock) {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    type = pm.type;
    brand = pm.card?.brand || null;
    last4 = pm.card?.last4 || '????';
    expMonth = pm.card?.exp_month || null;
    expYear = pm.card?.exp_year || null;
  }

  // Check if first method
  const existing = await sql`SELECT COUNT(*) as count FROM rider_payment_methods WHERE rider_id = ${riderId}`;
  const isFirst = Number((existing[0] as Record<string, unknown>).count) === 0;

  await sql`
    INSERT INTO rider_payment_methods (rider_id, stripe_payment_method_id, type, brand, last4, exp_month, exp_year, is_default)
    VALUES (${riderId}, ${paymentMethodId}, ${type}, ${brand}, ${last4}, ${expMonth}, ${expYear}, ${isFirst})
  `;
}

export async function getRiderPaymentMethods(riderId: string) {
  const rows = await sql`
    SELECT id, stripe_payment_method_id, type, brand, last4, exp_month, exp_year, is_default, apple_pay, google_pay, cash_app_pay
    FROM rider_payment_methods
    WHERE rider_id = ${riderId}
    ORDER BY is_default DESC, created_at DESC
  `;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    stripePaymentMethodId: r.stripe_payment_method_id,
    type: r.type,
    brand: r.brand,
    last4: r.last4,
    expMonth: r.exp_month,
    expYear: r.exp_year,
    isDefault: r.is_default,
    isApplePay: r.apple_pay,
    isGooglePay: r.google_pay,
    isCashAppPay: r.cash_app_pay,
  }));
}

export async function setDefaultPaymentMethod(riderId: string, paymentMethodDbId: string): Promise<void> {
  await sql`UPDATE rider_payment_methods SET is_default = false WHERE rider_id = ${riderId}`;
  await sql`UPDATE rider_payment_methods SET is_default = true WHERE id = ${paymentMethodDbId} AND rider_id = ${riderId}`;
}

export async function deletePaymentMethod(riderId: string, paymentMethodDbId: string): Promise<void> {
  const rows = await sql`
    SELECT stripe_payment_method_id, is_default FROM rider_payment_methods
    WHERE id = ${paymentMethodDbId} AND rider_id = ${riderId} LIMIT 1
  `;
  if (!rows.length) return;
  const pm = rows[0] as Record<string, unknown>;

  if (!isMock) {
    await stripe.paymentMethods.detach(pm.stripe_payment_method_id as string);
  }

  await sql`DELETE FROM rider_payment_methods WHERE id = ${paymentMethodDbId}`;

  // If was default, set next as default
  if (pm.is_default) {
    await sql`
      UPDATE rider_payment_methods SET is_default = true
      WHERE rider_id = ${riderId}
      AND id = (SELECT id FROM rider_payment_methods WHERE rider_id = ${riderId} ORDER BY created_at LIMIT 1)
    `;
  }
}
