// Pure partner delivery-fee types + split math. NO server imports (no DB,
// no platform_config) so this module is safe to import from client components
// (the admin preview) as well as server code. The DB-backed policy resolver
// lives in ./fees.ts, which re-exports everything here.

export type CommissionMode = 'percent' | 'flat' | 'none';

export interface FeePolicy {
  /** How HMU's cut of the delivery fee is calculated. */
  commission_mode: CommissionMode;
  /** Percent mode: basis points of the delivery fee (1500 = 15%). */
  commission_bps: number;
  /** Flat mode: fixed cents per delivery, regardless of fee size. */
  commission_flat_cents: number;
  /** Percent mode floor: commission never drops below this (cents). */
  min_commission_cents: number;
  /** When false (default), tips pass through 100% to the driver. */
  tip_takes_commission: boolean;
  /** When true (default), HMU absorbs the Stripe processing fee (matches the
   * current ride policy); informational for previews — actual application is
   * at charge time. */
  absorb_stripe_fee: boolean;
}

export const DEFAULT_FEE_POLICY: FeePolicy = {
  commission_mode: 'percent',
  commission_bps: 1500, // 15%
  commission_flat_cents: 200,
  min_commission_cents: 100,
  tip_takes_commission: false,
  absorb_stripe_fee: true,
};

export interface DeliverySplitInput {
  /** The delivery fee the customer pays (cents). HMU's commission comes out of
   * this. */
  deliveryFeeCents: number;
  /** Optional driver tip (cents). Passes through 100% unless the policy opts
   * tips into commission. */
  tipCents?: number;
  policy: FeePolicy;
}

export interface DeliverySplit {
  /** Total charged to the funding source (delivery fee + tip). */
  totalChargeCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  /** HMU's cut — becomes the Stripe application_fee_amount at charge time. */
  platformFeeCents: number;
  /** What lands in the driver's Connect account. */
  driverPayoutCents: number;
  /** Rough Stripe processing fee (2.9% + 30¢), informational for previews. */
  estimatedStripeFeeCents: number;
}

function commissionOn(amountCents: number, policy: FeePolicy): number {
  if (amountCents <= 0) return 0;
  let cut: number;
  switch (policy.commission_mode) {
    case 'none':
      return 0;
    case 'flat':
      cut = policy.commission_flat_cents;
      break;
    case 'percent':
    default:
      cut = Math.round((amountCents * policy.commission_bps) / 10000);
      cut = Math.max(cut, policy.min_commission_cents);
      break;
  }
  // Commission can never exceed the amount it's taken from.
  return Math.min(Math.max(0, cut), amountCents);
}

/** Pure split computation. No I/O — safe to unit test and to call per booking. */
export function computeDeliverySplit(input: DeliverySplitInput): DeliverySplit {
  const deliveryFeeCents = Math.max(0, Math.round(input.deliveryFeeCents));
  const tipCents = Math.max(0, Math.round(input.tipCents ?? 0));

  const feeCommission = commissionOn(deliveryFeeCents, input.policy);
  // Tips only take commission when explicitly opted in; the flat fee is a
  // per-delivery charge so it is never doubled on the tip.
  const tipCommission =
    input.policy.tip_takes_commission && input.policy.commission_mode === 'percent'
      ? commissionOn(tipCents, { ...input.policy, min_commission_cents: 0 })
      : 0;

  const platformFeeCents = feeCommission + tipCommission;
  const totalChargeCents = deliveryFeeCents + tipCents;
  const driverPayoutCents = totalChargeCents - platformFeeCents;
  const estimatedStripeFeeCents =
    totalChargeCents > 0 ? Math.round(totalChargeCents * 0.029) + 30 : 0;

  return {
    totalChargeCents,
    deliveryFeeCents,
    tipCents,
    platformFeeCents,
    driverPayoutCents,
    estimatedStripeFeeCents,
  };
}
