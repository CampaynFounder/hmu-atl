import { verifyWebhook } from '@clerk/backend/webhooks';
import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import sql from '../../../../../lib/db/client';
import posthog from '../../../../../lib/posthog/client';
import type { ProfileType } from '../../../../../lib/db/types';

const isMock = process.env.STRIPE_MOCK === 'true';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRealStripe(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-01-27.acacia',
  });
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
      const clerkId: string = data.id;
      const email: string = data.email_addresses?.[0]?.email_address ?? '';
      const profileType: ProfileType =
        (data.public_metadata?.profile_type as ProfileType) ?? 'rider';

      let stripeCustomerId: string;
      let stripeAccountId: string | null = null;

      if (isMock) {
        stripeCustomerId = `cus_mock_${clerkId}`;
        if (profileType === 'driver' || profileType === 'both') {
          stripeAccountId = `acct_mock_${clerkId}`;
        }
      } else {
        const stripe = await getRealStripe();

        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { clerk_id: clerkId },
        });
        stripeCustomerId = customer.id as string;

        if (profileType === 'driver' || profileType === 'both') {
          const account = await stripe.accounts.create({
            type: 'express',
            email: email || undefined,
            capabilities: { transfers: { requested: true } },
            metadata: { clerk_id: clerkId },
          });
          stripeAccountId = account.id as string;
        }
      }

      // Store Stripe IDs in Clerk publicMetadata
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: {
          stripeCustomerId,
          ...(stripeAccountId ? { stripeAccountId } : {}),
        },
      });

      await sql`
        INSERT INTO users (clerk_id, profile_type, account_status, tier, og_status, chill_score)
        VALUES (
          ${clerkId},
          ${profileType},
          'pending_activation',
          'free',
          false,
          0
        )
        ON CONFLICT (clerk_id) DO NOTHING
      `;
    } else if (type === 'user.updated') {
      const clerkId: string = data.id;
      const profileType: ProfileType =
        (data.public_metadata?.profile_type as ProfileType) ?? 'rider';

      await sql`
        UPDATE users
        SET profile_type = ${profileType}, updated_at = NOW()
        WHERE clerk_id = ${clerkId}
      `;
    } else if (type === 'user.deleted') {
      const clerkId: string = data.id;

      await sql`
        UPDATE users
        SET account_status = 'suspended', updated_at = NOW()
        WHERE clerk_id = ${clerkId}
      `;
    } else if (type === 'session.created') {
      posthog.capture({
        distinctId: data.user_id as string,
        event: 'session.created',
        properties: {
          session_id: data.id,
          client_id:  data.client_id,
          created_at: data.created_at,
        },
      });
    }
  } catch (err) {
    console.error(`[clerk-webhook] handler error for ${type}:`, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
