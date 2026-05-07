import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export type Tier = 'free' | 'hmu_first';

// Updates `users.tier` for every user attached to a Stripe customer (driver
// or rider) and mirrors the new value to Clerk publicMetadata.tier.
//
// Why this exists: the Stripe webhook handler updates `users.tier` directly,
// but Clerk publicMetadata is the source of truth for client-side tier reads
// (badge, instant-payout pricing, gated content). Without this sync, a user
// who downgrades on Stripe keeps `tier='hmu_first'` in their Clerk session
// forever — the perks that should have been revoked stay live.
//
// Returns the list of clerk_ids that were synced; useful for tests + audit.
export async function syncTierForCustomer(
  stripeCustomerId: string,
  tier: Tier
): Promise<string[]> {
  const rows = await sql`
    UPDATE users SET tier = ${tier}, updated_at = NOW()
    WHERE id IN (
      SELECT user_id FROM driver_profiles WHERE stripe_customer_id = ${stripeCustomerId}
      UNION
      SELECT user_id FROM rider_profiles  WHERE stripe_customer_id = ${stripeCustomerId}
    )
    RETURNING clerk_id
  `;

  const clerkIds: string[] = (rows as Array<Record<string, unknown>>)
    .map(r => r.clerk_id as string | null)
    .filter((id: string | null): id is string => Boolean(id));

  if (clerkIds.length === 0) return [];

  const clerk = await clerkClient();
  await Promise.all(
    clerkIds.map((id: string) =>
      clerk.users
        .updateUserMetadata(id, { publicMetadata: { tier } })
        .catch((e: unknown) => console.error(`syncTierForCustomer: clerk update failed for ${id}:`, e))
    )
  );

  return clerkIds;
}
