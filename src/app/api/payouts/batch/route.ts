/**
 * POST /api/payouts/batch
 *
 * Cron handler for the daily 6am batch payout job.
 * Triggered by Cloudflare Workers cron — authenticated via x-cron-secret header.
 *
 * For each pending payout in the Upstash Redis queue:
 *   1. Pop payout ID (FIFO)
 *   2. Execute Stripe Connect transfer with up to 3 retries
 *   3. On 3rd failure: mark failed + PostHog admin alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';
import { getPendingBatchPayouts, executePayoutWithRetry } from '../../../../../lib/payout';
import { captureEvent } from '../../../../lib/posthog-server';

const BATCH_QUEUE_KEY = 'payouts:batch:queue';

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const results: Array<{
      payout_id: string;
      driver_id: string;
      success: boolean;
      processor_id?: string;
      error?: string;
    }> = [];

    // Snapshot queue length so we only process jobs enqueued before this run
    const queueLen = await redis.llen(BATCH_QUEUE_KEY);

    // Fetch all pending batch payouts once to avoid N+1 DB queries
    const pendingPayouts = await getPendingBatchPayouts();
    const payoutMap = new Map(pendingPayouts.map((p) => [p.id, p]));

    for (let i = 0; i < queueLen; i++) {
      const payoutId = await redis.lpop<string>(BATCH_QUEUE_KEY);
      if (!payoutId) break;

      const payout = payoutMap.get(payoutId);
      if (!payout) {
        // Already processed or cancelled
        results.push({
          payout_id: payoutId,
          driver_id: 'unknown',
          success: false,
          error: 'not_found_or_already_processed',
        });
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

      captureEvent(payout.driver_id, 'payout_batch_processed', {
        payout_id: payout.id,
        success: result.success,
        net_payout: payout.net_payout,
        processor_id: result.processorId ?? null,
      });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    captureEvent('system', 'payout_batch_run_completed', {
      total: results.length,
      succeeded,
      failed,
    });

    return NextResponse.json({ processed: results.length, succeeded, failed, results });
  } catch (err) {
    console.error('[payouts/batch]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
