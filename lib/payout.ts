/**
 * Payout domain logic — shared across release and batch routes.
 * All types imported from /lib/db/types.ts only.
 */

import type { Payout, PayoutStatus } from './db/types';
import sql from './db/index';
import { createTransfer } from './stripe';
import posthog from './posthog';

// ─── Fee constants ────────────────────────────────────────────────────────────

export const FREE_PLATFORM_FEE_RATE = 0.25;    // 25 %
export const HMU_FIRST_PLATFORM_FEE_RATE = 0.15; // 15 %

// ─── Tier helpers ─────────────────────────────────────────────────────────────

/** Resolve a driver's tier from Clerk publicMetadata.
 *  Callers should pass the raw metadata object they got from Clerk auth(). */
export function isHmuFirstDriver(
  publicMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return publicMetadata?.tier === 'hmu_first';
}

export function platformFeeRate(isFirstTier: boolean): number {
  return isFirstTier ? HMU_FIRST_PLATFORM_FEE_RATE : FREE_PLATFORM_FEE_RATE;
}

/** Returns { platformFee, driverEarnings } in dollars (not cents). */
export function splitFare(
  totalFare: number,
  isFirstTier: boolean,
): { platformFee: number; driverEarnings: number } {
  const rate = platformFeeRate(isFirstTier);
  const platformFee = Math.round(totalFare * rate * 100) / 100;
  const driverEarnings = Math.round((totalFare - platformFee) * 100) / 100;
  return { platformFee, driverEarnings };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export async function insertPayout(params: {
  driver_id: string;
  ride_id: string;
  amount: number;
  platform_fees: number;
  net_payout: number;
  currency: string;
  payout_method: string;
  payout_account_id: string | null;
  status: PayoutStatus;
  period_start_date: Date;
  period_end_date: Date;
  scheduled_date: Date | null;
  processor_payout_id: string | null;
  metadata: Record<string, unknown>;
}): Promise<Payout> {
  const rows = await sql`
    INSERT INTO payouts (
      driver_id, amount, currency, payout_method, payout_account_id,
      status, processor_payout_id, period_start_date, period_end_date,
      rides_count, total_earnings, platform_fees, adjustments, net_payout,
      scheduled_date, metadata, created_at
    ) VALUES (
      ${params.driver_id},
      ${params.amount},
      ${params.currency},
      ${params.payout_method},
      ${params.payout_account_id},
      ${params.status},
      ${params.processor_payout_id},
      ${params.period_start_date.toISOString()},
      ${params.period_end_date.toISOString()},
      1,
      ${params.amount},
      ${params.platform_fees},
      0,
      ${params.net_payout},
      ${params.scheduled_date ? params.scheduled_date.toISOString() : null},
      ${JSON.stringify(params.metadata)},
      NOW()
    )
    RETURNING *
  `;
  return rows[0] as Payout;
}

export async function updatePayoutStatus(
  id: string,
  status: PayoutStatus,
  updates: {
    processor_payout_id?: string;
    failure_reason?: string;
    processed_at?: Date;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await sql`
    UPDATE payouts
    SET
      status = ${status},
      processor_payout_id = COALESCE(${updates.processor_payout_id ?? null}, processor_payout_id),
      failure_reason = ${updates.failure_reason ?? null},
      processed_at = ${updates.processed_at ? updates.processed_at.toISOString() : null},
      metadata = COALESCE(${updates.metadata ? JSON.stringify(updates.metadata) : null}::jsonb, metadata)
    WHERE id = ${id}
  `;
}

export async function getPendingBatchPayouts(): Promise<Payout[]> {
  const rows = await sql`
    SELECT * FROM payouts
    WHERE status = 'pending'
      AND payout_method = 'batch'
      AND (scheduled_date IS NULL OR scheduled_date <= NOW())
    ORDER BY created_at ASC
  `;
  return rows as Payout[];
}

export async function getDriverPayouts(driverId: string): Promise<Payout[]> {
  const rows = await sql`
    SELECT * FROM payouts
    WHERE driver_id = ${driverId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return rows as Payout[];
}

// ─── Stripe transfer executor ─────────────────────────────────────────────────

export async function executeStripeTransfer(payout: Payout): Promise<string> {
  const stripeAccountId = payout.payout_account_id ?? 'acct_mock';
  const amountCents = Math.round((payout.net_payout ?? payout.amount) * 100);

  const transfer = await createTransfer({
    amount_cents: amountCents,
    currency: payout.currency,
    destination: stripeAccountId,
    description: `HMU-ATL payout ${payout.id}`,
    metadata: {
      payout_id: payout.id,
      driver_id: payout.driver_id,
    },
  });

  return transfer.id;
}

// ─── Admin notification ───────────────────────────────────────────────────────

export async function notifyAdminPayoutFailed(
  payout: Payout,
  attempt: number,
  reason: string,
): Promise<void> {
  // In production this would send a Slack / email / PagerDuty alert.
  // For now we log and emit a PostHog event so the admin dashboard can alert.
  console.error(
    `[payout-failure] payout=${payout.id} driver=${payout.driver_id} attempt=${attempt} reason=${reason}`,
  );
  posthog.capture({
    distinctId: 'admin',
    event: 'payout_failed_admin_alert',
    properties: {
      payout_id: payout.id,
      driver_id: payout.driver_id,
      attempt,
      reason,
    },
  });
}

// ─── Retry logic ──────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Executes a payout with up to MAX_RETRY_ATTEMPTS attempts.
 * On 3rd failure, marks the payout failed and notifies admin.
 */
export async function executePayoutWithRetry(payout: Payout): Promise<{
  success: boolean;
  processorId?: string;
  error?: string;
}> {
  const currentAttempts = Number(
    (payout.metadata as Record<string, unknown>)?.attempts ?? 0,
  );

  for (let attempt = currentAttempts + 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await updatePayoutStatus(payout.id, 'processing', {
        metadata: { ...(payout.metadata as Record<string, unknown>), attempts: attempt },
      });

      const processorId = await executeStripeTransfer(payout);

      await updatePayoutStatus(payout.id, 'completed', {
        processor_payout_id: processorId,
        processed_at: new Date(),
      });

      return { success: true, processorId };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);

      if (attempt >= MAX_RETRY_ATTEMPTS) {
        await updatePayoutStatus(payout.id, 'failed', {
          failure_reason: reason,
          metadata: { ...(payout.metadata as Record<string, unknown>), attempts: attempt },
        });
        await notifyAdminPayoutFailed(payout, attempt, reason);
        return { success: false, error: reason };
      }

      // Back off slightly between retries
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  return { success: false, error: 'max retries exceeded' };
}
