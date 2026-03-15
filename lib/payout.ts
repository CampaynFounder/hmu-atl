/**
 * Payout domain logic shared across release and batch routes.
 * All types imported from /lib/db/types.ts only.
 */

import type { Payout, TimingTier } from './db/types';
import sql from './db/client';
import { createTransfer } from './stripe';
import posthog from './posthog';

type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface PayoutRecord extends Payout {
  net_payout: number;
  payout_account_id: string | null;
}

export const FREE_PLATFORM_FEE_RATE = 0.25;
export const HMU_FIRST_PLATFORM_FEE_RATE = 0.15;

export function isHmuFirstDriver(
  publicMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return publicMetadata?.tier === 'hmu_first';
}

export function splitFare(
  totalFare: number,
  isFirstTier: boolean,
): { platformFee: number; driverEarnings: number } {
  const rate = isFirstTier ? HMU_FIRST_PLATFORM_FEE_RATE : FREE_PLATFORM_FEE_RATE;
  const platformFee = Math.round(totalFare * rate * 100) / 100;
  const driverEarnings = Math.round((totalFare - platformFee) * 100) / 100;
  return { platformFee, driverEarnings };
}

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
}): Promise<PayoutRecord> {
  const timingTier: TimingTier = params.payout_method === 'instant' ? 'hmu_first' : 'free';
  const processedAt = params.payout_method === 'instant' ? new Date().toISOString() : null;

  const rows = await sql`
    INSERT INTO payouts (
      ride_id, driver_id, amount, fee, timing_tier,
      stripe_transfer_id, created_at, processed_at
    ) VALUES (
      ${params.ride_id}, ${params.driver_id}, ${params.amount}, ${params.platform_fees},
      ${timingTier}, ${params.processor_payout_id}, NOW(), ${processedAt}
    )
    RETURNING id, ride_id, driver_id, amount, fee, timing_tier,
              stripe_transfer_id, created_at, processed_at
  `;

  const row = rows[0] as Payout;
  return { ...row, net_payout: params.net_payout, payout_account_id: params.payout_account_id };
}

export async function updatePayoutStatus(
  id: string,
  _status: PayoutStatus,
  updates: {
    processor_payout_id?: string;
    failure_reason?: string;
    processed_at?: Date;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const transferId = updates.processor_payout_id ?? null;
  const processedAt = updates.processed_at ? updates.processed_at.toISOString() : null;

  if (transferId !== null || processedAt !== null) {
    await sql`
      UPDATE payouts
      SET
        stripe_transfer_id = COALESCE(${transferId}, stripe_transfer_id),
        processed_at = COALESCE(${processedAt}, processed_at)
      WHERE id = ${id}
    `;
  }
}

export async function getPendingBatchPayouts(): Promise<PayoutRecord[]> {
  const rows = await sql`
    SELECT
      p.id, p.ride_id, p.driver_id, p.amount, p.fee,
      p.timing_tier, p.stripe_transfer_id, p.created_at, p.processed_at,
      dp.stripe_account_id AS payout_account_id
    FROM payouts p
    LEFT JOIN driver_profiles dp ON dp.user_id = p.driver_id
    WHERE p.timing_tier = 'free'
      AND p.processed_at IS NULL
    ORDER BY p.created_at ASC
  `;

  return rows.map((r) => ({
    id: r.id as string,
    ride_id: r.ride_id as string,
    driver_id: r.driver_id as string,
    amount: r.amount as number,
    fee: r.fee as number,
    timing_tier: r.timing_tier as TimingTier,
    stripe_transfer_id: (r.stripe_transfer_id ?? undefined) as string | undefined,
    created_at: r.created_at as Date,
    processed_at: (r.processed_at ?? undefined) as Date | undefined,
    net_payout: Math.round(((r.amount as number) - (r.fee as number)) * 100) / 100,
    payout_account_id: (r.payout_account_id ?? null) as string | null,
  }));
}

export async function getDriverPayouts(driverId: string): Promise<PayoutRecord[]> {
  const rows = await sql`
    SELECT
      p.id, p.ride_id, p.driver_id, p.amount, p.fee,
      p.timing_tier, p.stripe_transfer_id, p.created_at, p.processed_at,
      dp.stripe_account_id AS payout_account_id
    FROM payouts p
    LEFT JOIN driver_profiles dp ON dp.user_id = p.driver_id
    WHERE p.driver_id = ${driverId}
    ORDER BY p.created_at DESC
    LIMIT 100
  `;

  return rows.map((r) => ({
    id: r.id as string,
    ride_id: r.ride_id as string,
    driver_id: r.driver_id as string,
    amount: r.amount as number,
    fee: r.fee as number,
    timing_tier: r.timing_tier as TimingTier,
    stripe_transfer_id: (r.stripe_transfer_id ?? undefined) as string | undefined,
    created_at: r.created_at as Date,
    processed_at: (r.processed_at ?? undefined) as Date | undefined,
    net_payout: Math.round(((r.amount as number) - (r.fee as number)) * 100) / 100,
    payout_account_id: (r.payout_account_id ?? null) as string | null,
  }));
}

export async function executeStripeTransfer(payout: PayoutRecord): Promise<string> {
  const stripeAccountId = payout.payout_account_id ?? `acct_mock_${payout.driver_id}`;
  const amountCents = Math.round(payout.net_payout * 100);

  const transfer = await createTransfer({
    amount_cents: amountCents,
    currency: 'usd',
    destination: stripeAccountId,
    description: `HMU-ATL payout ${payout.id}`,
    metadata: { payout_id: payout.id, driver_id: payout.driver_id },
  });

  return transfer.id;
}

export async function notifyAdminPayoutFailed(
  payout: PayoutRecord,
  attempt: number,
  reason: string,
): Promise<void> {
  console.error(`[payout-failure] payout=${payout.id} driver=${payout.driver_id} attempt=${attempt} reason=${reason}`);
  posthog.capture({
    distinctId: 'admin',
    event: 'payout_failed_admin_alert',
    properties: { payout_id: payout.id, driver_id: payout.driver_id, attempt, reason },
  });
}

const MAX_RETRY_ATTEMPTS = 3;

export async function executePayoutWithRetry(payout: PayoutRecord): Promise<{
  success: boolean;
  processorId?: string;
  error?: string;
}> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const processorId = await executeStripeTransfer(payout);
      await updatePayoutStatus(payout.id, 'completed', {
        processor_payout_id: processorId,
        processed_at: new Date(),
      });
      return { success: true, processorId };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        await notifyAdminPayoutFailed(payout, attempt, reason);
        return { success: false, error: reason };
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { success: false, error: 'max retries exceeded' };
}
