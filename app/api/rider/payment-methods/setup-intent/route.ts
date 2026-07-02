import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getOrCreateStripeCustomer, createSetupIntent } from '@/lib/stripe/rider-payments';
import { isFeatureEnabled } from '@/lib/feature-flags';

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  // Get email from Clerk
  const { clerkClient } = await import('@clerk/nextjs/server');
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkId);
  const email = clerkUser.primaryEmailAddress?.emailAddress || '';

  try {
    const customerId = await getOrCreateStripeCustomer({ id: userId, email, clerkId });
    const clientSecret = await createSetupIntent(customerId);
    // Superadmin-toggleable (feature_flags: rider_apple_pay_button). OFF by
    // default → no change. When ON, the mobile payment-setup screen renders a
    // dedicated, always-visible native Apple Pay button so App Store review can
    // locate the Apple Pay integration (it otherwise only appears inside the
    // Stripe payment sheet modal). Togglable live at /admin/feature-flags.
    const applePayButton = await isFeatureEnabled('rider_apple_pay_button', { userId });
    return NextResponse.json({ clientSecret, customerId, applePayButton });
  } catch (err: any) {
    console.error('[setup-intent] Stripe error:', err?.message);
    // Surface a clear message so mobile can show actionable UI
    return NextResponse.json({ error: err?.message ?? 'Failed to create payment session' }, { status: 500 });
  }
}
