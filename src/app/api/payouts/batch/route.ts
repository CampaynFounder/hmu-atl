/**
 * POST /api/payouts/batch
 *
 * Cron handler for the 6am daily batch payout job.
 * Triggered by Cloudflare Workers cron — secured by CRON_SECRET header.
 *
 * For each pending batch payout queued in Upstash Redis:
 *   1. Pop the payout ID from the queue
 *   2. Execute Stripe Connect transfer with retry (max 3 attempts)
 *   3. On 3rd failure: mark failed + notify admin via PostHog
 *
 * Protected by Clerk auth middleware (route-level) + CRON_SECRET guard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getPendingBatchPayouts, executePayoutWithRetry } from '../../../../../lib/payout';
import posthog from '../../../../../lib/posthog';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const BATCH_QUEUE_KEY = 'payouts:batch:queue';

export async function POST(req: NextRequest) {
  // Guard: only allow calls from our cron worker
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Drain the Redis queue and process each payout
    const results: Array<{
      payout_id: string;
      driver_id: string;
      success: boolean;
      processor_id?: string;
      error?: string;
    }> = [];

    // Process all queued IDs (llen so we only do payouts enqueued before this run)
    const queueLen = await redis.llen(BATCH_QUEUE_KEY);

    for (let i = 0; i < queueLen; i++) {
      // Pop from left (FIFO)
      const payoutId = await redis.lpop<string>(BATCH_QUEUE_KEY);
      if (!payoutId) break;

      // Fetch the payout from DB (getPendingBatchPayouts returns all pending,
      // we filter to the specific ID via a dedicated query below)
      const payouts = await getPendingBatchPayouts();
      const payout = payouts.find((p) => p.id === payoutId);

      if (!payout) {
        // Already processed or cancelled — skip
        results.push({ payout_id: payoutId, driver_id: 'unknown', success: false, error: 'not_found' });
        continue;
      }

      const result = await executePayoutWithRetry(payout);

      results.push({
        payout_id: payout.id,
        driver_id: payout.driver_id,
        success: result.success,
        processor_id: result.processorId,
        error: result.error,
      });

      posthog.capture({
        distinctId: payout.driver_id,
        event: 'payout_batch_processed',
        properties: {
          payout_id: payout.id,
          driver_id: payout.driver_id,
          success: result.success,
          net_payout: payout.net_payout,
          processor_id: result.processorId ?? null,
        },
      });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    posthog.capture({
      distinctId: 'system',
      event: 'payout_batch_run_completed',
      properties: { total: results.length, succeeded, failed },
    });

    return NextResponse.json({ processed: results.length, succeeded, failed, results });
  } catch (err) {
    console.error('[payouts/batch] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
