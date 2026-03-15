/**
 * POST /api/payouts/release
 *
 * Triggered after the 45-minute dispute window closes cleanly.
 * - Free tier:      queues payout in Upstash Redis for next 6am batch
 * - HMU First tier: executes an immediate Stripe Connect transfer
 *
 * Protected by Clerk auth middleware (src/middleware.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { redis } from '../../../../lib/redis';
import {
  isHmuFirstDriver,
  splitFare,
  insertPayout,
  executePayoutWithRetry,
} from '../../../../../lib/payout';
import { captureEvent } from '../../../../lib/posthog-server';

export const BATCH_QUEUE_KEY = 'payouts:batch:queue';

function nextSixAm(): Date {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(6, 0, 0, 0);
  return next;
}

export async function POST(req: NextRequest) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    ride_id: string;
    driver_id: string;
    total_fare: number;
    currency?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ride_id, driver_id, total_fare, currency = 'usd' } = body;
  if (!ride_id || !driver_id || typeof total_fare !== 'number') {
    return NextResponse.json(
      { error: 'ride_id, driver_id, and total_fare are required' },
      { status: 400 },
    );
  }

  const publicMetadata = (sessionClaims?.metadata ?? {}) as Record<string, unknown>;
  const isFirstTier = isHmuFirstDriver(publicMetadata);
  const { platformFee, driverEarnings } = splitFare(total_fare, isFirstTier);
  const now = new Date();

  try {
    if (isFirstTier) {
      // ── HMU First: instant Stripe Connect transfer ────────────────────────
      const payout = await insertPayout({
        driver_id,
        ride_id,
        amount: total_fare,
        platform_fees: platformFee,
        net_payout: driverEarnings,
        currency,
        payout_method: 'instant',
        payout_account_id: (publicMetadata.stripe_connect_id as string) ?? null,
        status: 'pending',
        period_start_date: now,
        period_end_date: now,
        scheduled_date: null,
        processor_payout_id: null,
        metadata: { ride_id, tier: 'hmu_first' },
      });

      const result = await executePayoutWithRetry(payout);

      captureEvent(driver_id, 'payout_released', {
        payout_id: payout.id,
        ride_id,
        tier: 'hmu_first',
        amount: total_fare,
        driver_earnings: driverEarnings,
        platform_fee: platformFee,
        instant: true,
        success: result.success,
      });

      return NextResponse.json({
        payout_id: payout.id,
        tier: 'hmu_first',
        instant: true,
        driver_earnings: driverEarnings,
        platform_fee: platformFee,
        success: result.success,
        processor_id: result.processorId ?? null,
      });
    } else {
      // ── Free tier: queue for 6am daily batch ──────────────────────────────
      const scheduledDate = nextSixAm();

      const payout = await insertPayout({
        driver_id,
        ride_id,
        amount: total_fare,
        platform_fees: platformFee,
        net_payout: driverEarnings,
        currency,
        payout_method: 'batch',
        payout_account_id: (publicMetadata.stripe_connect_id as string) ?? null,
        status: 'pending',
        period_start_date: now,
        period_end_date: now,
        scheduled_date: scheduledDate,
        processor_payout_id: null,
        metadata: { ride_id, tier: 'free' },
      });

      await redis.rpush(BATCH_QUEUE_KEY, payout.id);

      captureEvent(driver_id, 'payout_released', {
        payout_id: payout.id,
        ride_id,
        tier: 'free',
        amount: total_fare,
        driver_earnings: driverEarnings,
        platform_fee: platformFee,
        instant: false,
        scheduled_date: scheduledDate.toISOString(),
      });

      return NextResponse.json({
        payout_id: payout.id,
        tier: 'free',
        instant: false,
        driver_earnings: driverEarnings,
        platform_fee: platformFee,
        scheduled_date: scheduledDate.toISOString(),
      });
    }
  } catch (err) {
    console.error('[payouts/release]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
