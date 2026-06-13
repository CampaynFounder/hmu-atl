// Partner delivery-fee policy resolver (DB-backed).
//
// For delivery/order vendors, the customer's ORDER charges are handled on the
// vendor's own Stripe (they never touch HMU). The DELIVERY fee is charged by
// HMU as its own destination charge to the driver's Connect account, with
// HMU's commission taken as the Stripe application fee. The pure split math +
// types live in ./fee-policy (server-free); this module adds the resolver that
// reads the admin-configurable policy from platform_config.
//
// Config lives in platform_config (no dedicated table), mirroring the blast
// pricing pattern so the same no-code admin UI + per-market override works:
//   partner_fees.config           → global default
//   partner_fees:market:{slug}    → per-market override (deep-merged)

import { getPlatformConfig } from '@/lib/platform-config/get';
import { DEFAULT_FEE_POLICY, type FeePolicy } from '@/lib/partner/fee-policy';

export {
  DEFAULT_FEE_POLICY,
  computeDeliverySplit,
} from '@/lib/partner/fee-policy';
export type {
  FeePolicy,
  CommissionMode,
  DeliverySplit,
  DeliverySplitInput,
} from '@/lib/partner/fee-policy';

const GLOBAL_KEY = 'partner_fees.config';
const marketKey = (slug: string) => `partner_fees:market:${slug}`;

/** Resolve the effective fee policy for a market (or the global default when no
 * market slug is supplied / no override exists). The market override is
 * shallow-merged over the resolved global (which already has defaults filled
 * in), so a partial market row only overrides the fields it sets. */
export async function resolveFeePolicy(marketSlug?: string | null): Promise<FeePolicy> {
  // getPlatformConfig is generic over Record<string, unknown>; FeePolicy is a
  // fixed-shape interface, so widen the defaults going in and narrow on the way
  // out rather than loosening the public FeePolicy type with an index signature.
  const defaults = DEFAULT_FEE_POLICY as unknown as Record<string, unknown>;
  const global = (await getPlatformConfig(GLOBAL_KEY, defaults)) as unknown as FeePolicy;
  if (!marketSlug) return global;
  return (await getPlatformConfig(
    marketKey(marketSlug),
    global as unknown as Record<string, unknown>,
  )) as unknown as FeePolicy;
}
