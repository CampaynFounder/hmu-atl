import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import posthog from '../posthog';
import { calculateFee } from './calculator';
import type { Tier, TimingTier } from '../db/types';

const BATCH_QUEUE_KEY = 'payout:batch:queue';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const isMock = process.env.STRIPE_MOCK !== 'false';

async function getStripe() {
  const Stripe = (await import('stripe')).default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' as any });
}

interface BatchPayoutJob {
  payoutId: string;
  rideId: string;
  driverId: string;
  stripeAccountId: string;
  net: number;
}

export async function releasePayout(
  rideId: string,
  driverId: string
): Promise<{ payoutId: string; timing: TimingTier }> {
  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT u.tier, dp.stripe_account_id, r.amount
    FROM rides r
    JOIN users u ON u.id = ${driverId}
    LEFT JOIN driver_profiles dp ON dp.user_id = ${driverId}
    WHERE r.id = ${rideId}
    LIMIT 1
  `;

  if (!rows.length) throw new Error(`Ride ${rideId} not found`);

  const tier = rows[0].tier as Tier;
  const stripeAccountId = (rows[0].stripe_account_id ?? `acct_mock_${driverId}`) as string;
  const amount = rows[0].amount as number;

  const { gross, fee, net } = calculateFee(amount, tier);
  const timingTier: TimingTier = tier === 'hmu_first' ? 'hmu_first' : 'free';

  let stripeTransferId: string | null = null;

  if (timingTier === 'hmu_first') {
    if (isMock) {
      stripeTransferId = `tr_mock_${rideId}_${Date.now()}`;
    } else {
      const stripe = await getStripe();
      const transfer = await stripe.transfers.create({
        amount: Math.round(net * 100),
        currency: 'usd',
        destination: stripeAccountId,
        transfer_group: rideId,
        metadata: { ride_id: rideId, driver_id: driverId },
      });
      stripeTransferId = transfer.id;
    }
  }

  const processedAt = timingTier === 'hmu_first' ? new Date().toISOString() : null;
  const payoutRows = await sql`
    INSERT INTO payouts (
      ride_id, driver_id, amount, fee, timing_tier,
      stripe_transfer_id, created_at, processed_at
    ) VALUES (
      ${rideId}, ${driverId}, ${gross}, ${fee}, ${timingTier},
      ${stripeTransferId}, NOW(), ${processedAt}
    )
    RETURNING id
  `;

  const payoutId = payoutRows[0].id as string;

  if (timingTier === 'free') {
    const job: BatchPayoutJob = { payoutId, rideId, driverId, stripeAccountId, net };
    await redis.lpush(BATCH_QUEUE_KEY, JSON.stringify(job));
  }

  posthog.capture({
    distinctId: driverId,
    event: 'payout.released',
    properties: { payout_id: payoutId, ride_id: rideId, gross, fee, net, timing_tier: timingTier,
      stripe_transfer_id: stripeTransferId, instant: timingTier === 'hmu_first' },
  });

  return { payoutId, timing: timingTier };
}

export async function processDailyBatch(): Promise<{ processed: number; failed: number }> {
  const sql = neon(process.env.DATABASE_URL!);

  const queueLength = await redis.llen(BATCH_QUEUE_KEY);
  if (queueLength === 0) return { processed: 0, failed: 0 };

  const rawItems = await redis.lrange(BATCH_QUEUE_KEY, 0, queueLength - 1);
  let processed = 0;
  let failed = 0;
  const stripe = isMock ? null : await getStripe();

  for (const raw of rawItems) {
    const job: BatchPayoutJob = typeof raw === 'string' ? JSON.parse(raw) : raw;
    try {
      let transferId: string;
      if (isMock) {
        transferId = `tr_mock_batch_${job.payoutId}_${Date.now()}`;
      } else {
        const transfer = await stripe!.transfers.create({
          amount: Math.round(job.net * 100),
          currency: 'usd',
          destination: job.stripeAccountId,
          transfer_group: job.rideId,
          metadata: { payout_id: job.payoutId, ride_id: job.rideId, driver_id: job.driverId, batch: 'daily' },
        });
        transferId = transfer.id;
      }
      await sql`UPDATE payouts SET stripe_transfer_id = ${transferId}, processed_at = NOW() WHERE id = ${job.payoutId}`;
      posthog.capture({ distinctId: job.driverId, event: 'payout.batch_processed',
        properties: { payout_id: job.payoutId, ride_id: job.rideId, net: job.net, stripe_transfer_id: transferId } });
      processed++;
    } catch (err) {
      console.error(`[payout-batch] failed for payout ${job.payoutId}:`, err);
      failed++;
    }
  }

  await redis.ltrim(BATCH_QUEUE_KEY, queueLength, -1);
  return { processed, failed };
}
