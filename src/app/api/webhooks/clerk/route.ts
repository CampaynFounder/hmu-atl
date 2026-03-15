import { verifyWebhook } from '@clerk/backend/webhooks';
import { NextRequest, NextResponse } from 'next/server';
import sql from '../../../../../lib/db/client';
import posthog from '../../../../../lib/posthog';
import type { UserType } from '../../../../../lib/db/types';

const isMock = process.env.STRIPE_MOCK !== 'false';

async function getStripe() {
  const Stripe = (await import('stripe')).default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' as any });
}

export async function POST(req: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;

  try {
    event = await verifyWebhook(req);
  } catch {
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  const { type } = event;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (event as any).data;

  try {
    if (type === 'user.created') {
      const email: string = data.email_addresses?.[0]?.email_address ?? '';
      const phone: string = data.phone_numbers?.[0]?.phone_number ?? '';
      const fullName: string = [data.first_name, data.last_name].filter(Boolean).join(' ');
      const userType: UserType = (data.public_metadata?.user_type as UserType) ?? 'rider';
      const clerkId: string = data.id;
      const isVerified: boolean = data.email_addresses?.[0]?.verification?.status === 'verified';

      let stripeCustomerId: string | null = null;
      let stripeConnectId: string | null = null;

      if (!isMock) {
        const stripe = await getStripe();

        const customer = await stripe.customers.create({
          email,
          name: fullName || undefined,
          phone: phone || undefined,
          metadata: { clerk_id: clerkId },
        });
        stripeCustomerId = customer.id;

        if (userType === 'driver' || userType === 'both') {
          const account = await stripe.accounts.create({
            type: 'express',
            email,
            capabilities: { transfers: { requested: true } },
            metadata: { clerk_id: clerkId },
          });
          stripeConnectId = account.id;
        }
      } else {
        stripeCustomerId = `cus_mock_${clerkId}`;
        if (userType === 'driver' || userType === 'both') {
          stripeConnectId = `acct_mock_${clerkId}`;
        }
      }

      await sql`
        INSERT INTO users (
          email, phone_number, full_name, user_type,
          auth_provider, auth_provider_id, profile_image_url,
          stripe_customer_id, stripe_connect_id,
          is_verified, is_active, created_at, updated_at
        ) VALUES (
          ${email}, ${phone}, ${fullName}, ${userType},
          'clerk', ${clerkId}, ${data.image_url ?? null},
          ${stripeCustomerId}, ${stripeConnectId},
          ${isVerified}, true, NOW(), NOW()
        )
        ON CONFLICT (auth_provider_id) DO NOTHING
      `;
    } else if (type === 'user.updated') {
      const email: string = data.email_addresses?.[0]?.email_address ?? '';
      const phone: string = data.phone_numbers?.[0]?.phone_number ?? '';
      const fullName: string = [data.first_name, data.last_name].filter(Boolean).join(' ');
      const userType: UserType = (data.public_metadata?.user_type as UserType) ?? 'rider';
      const clerkId: string = data.id;
      const isVerified: boolean = data.email_addresses?.[0]?.verification?.status === 'verified';

      await sql`
        UPDATE users SET
          email          = ${email},
          phone_number   = ${phone},
          full_name      = ${fullName},
          user_type      = ${userType},
          profile_image_url = ${data.image_url ?? null},
          is_verified    = ${isVerified},
          updated_at     = NOW()
        WHERE auth_provider_id = ${clerkId}
      `;
    } else if (type === 'user.deleted') {
      const clerkId: string = data.id;

      await sql`
        UPDATE users
        SET is_active = false, updated_at = NOW()
        WHERE auth_provider_id = ${clerkId}
      `;
    } else if (type === 'session.created') {
      posthog.capture({
        distinctId: data.user_id as string,
        event: 'session.created',
        properties: {
          session_id:  data.id,
          client_id:   data.client_id,
          created_at:  data.created_at,
        },
      });
    }
  } catch (err) {
    console.error(`[clerk-webhook] handler error for ${type}:`, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
