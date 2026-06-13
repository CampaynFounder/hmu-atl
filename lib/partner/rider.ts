// Partner rider resolution.
//
// A vendor's customer is not an HMU user. We map each (partner, external_ref)
// to a synthetic `users` row (profile_type='rider', account_status='active')
// with a sentinel clerk_id of `partner:{partnerId}:{externalRef}` so existing
// `WHERE clerk_id = ...` lookups never collide with real Clerk users. This lets
// the booking flow through the normal hmu_posts/rides/ledger machinery
// unchanged. The mapping is recorded in partner_riders so repeat orders from
// the same customer reuse the same synthetic rider.
//
// Payment note: for vendor_funded partners the delivery fee is charged to the
// vendor's own Stripe customer, NOT a per-rider customer — so we record the
// vendor's customer id on the mapping for reference, but no rider-level Stripe
// customer is created here.

import { sql } from '@/lib/db/client';

export interface ExternalRider {
  ref: string;
  name?: string | null;
  phone?: string | null;
}

export interface PartnerRider {
  userId: string;
  stripeCustomerId: string | null;
}

export async function resolvePartnerRider(
  partnerId: string,
  external: ExternalRider,
  marketId: string,
  vendorStripeCustomerId: string | null,
): Promise<PartnerRider> {
  const existing = await sql`
    SELECT user_id, stripe_customer_id
    FROM partner_riders
    WHERE partner_id = ${partnerId} AND external_ref = ${external.ref}
    LIMIT 1
  `;
  if (existing[0]) {
    const row = existing[0] as { user_id: string; stripe_customer_id: string | null };
    return { userId: row.user_id, stripeCustomerId: row.stripe_customer_id };
  }

  const clerkId = `partner:${partnerId}:${external.ref}`;
  const userRows = await sql`
    INSERT INTO users (clerk_id, profile_type, account_status, chill_score, phone, market_id)
    VALUES (${clerkId}, 'rider', 'active', 100, ${external.phone ?? null}, ${marketId})
    ON CONFLICT (clerk_id) DO UPDATE SET market_id = EXCLUDED.market_id
    RETURNING id
  `;
  const userId = (userRows[0] as { id: string }).id;

  await sql`
    INSERT INTO partner_riders (partner_id, external_ref, user_id, stripe_customer_id)
    VALUES (${partnerId}, ${external.ref}, ${userId}, ${vendorStripeCustomerId})
    ON CONFLICT (partner_id, external_ref) DO NOTHING
  `;

  return { userId, stripeCustomerId: vendorStripeCustomerId };
}
