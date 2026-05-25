// GET  — returns { acceptsDownBad, hasPaymentMethod, disclaimerText }
// PATCH — body { accepts: boolean }
//   accepts: true  → requires payment method; sets flag + timestamp
//   accepts: false → clears flag; no payment gate

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getPlatformConfig } from '@/lib/platform-config/get';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });
const isMock = process.env.STRIPE_MOCK === 'true';

async function getDriver(clerkId: string) {
  const rows = await sql`
    SELECT u.id, dp.stripe_customer_id, dp.accepts_down_bad, dp.stripe_onboarding_complete
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  return rows[0] as {
    id: string;
    stripe_customer_id: string | null;
    accepts_down_bad: boolean;
    stripe_onboarding_complete: boolean;
  };
}

async function checkPaymentMethod(stripeCustomerId: string | null): Promise<boolean> {
  if (isMock) return true;
  if (!stripeCustomerId) return false;
  try {
    const methods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      limit: 1,
    });
    return methods.data.length > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const driver = await getDriver(clerkId);
  if (!driver) return NextResponse.json({ error: 'Driver profile required' }, { status: 403 });

  const [hasPaymentMethod, disclaimer] = await Promise.all([
    checkPaymentMethod(driver.stripe_customer_id),
    getPlatformConfig('down_bad.disclaimer', { rider_text: '', driver_text: '' }),
  ]);

  return NextResponse.json({
    acceptsDownBad: driver.accepts_down_bad ?? false,
    hasPaymentMethod,
    disclaimerText: (disclaimer as { driver_text?: string }).driver_text ?? '',
  });
}

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const driver = await getDriver(clerkId);
  if (!driver) return NextResponse.json({ error: 'Driver profile required' }, { status: 403 });

  let body: { accepts?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.accepts !== 'boolean') {
    return NextResponse.json({ error: 'accepts must be boolean' }, { status: 400 });
  }

  if (body.accepts) {
    const hasMethod = await checkPaymentMethod(driver.stripe_customer_id);
    if (!hasMethod) {
      return NextResponse.json(
        { error: 'Link a payment method before enabling Down Bad' },
        { status: 422 },
      );
    }

    await sql`
      UPDATE driver_profiles
      SET accepts_down_bad = TRUE, accepts_down_bad_at = NOW(), updated_at = NOW()
      WHERE user_id = ${driver.id}
    `;
  } else {
    await sql`
      UPDATE driver_profiles
      SET accepts_down_bad = FALSE, updated_at = NOW()
      WHERE user_id = ${driver.id}
    `;
  }

  return NextResponse.json({ acceptsDownBad: body.accepts });
}
