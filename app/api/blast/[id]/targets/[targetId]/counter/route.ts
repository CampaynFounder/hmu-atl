// POST /api/blast/[id]/targets/[targetId]/counter — driver counter-offer at
// $Y instead of rider's ask. Counter price clamped to ±counterOfferMaxPct
// per contract §3 D-2. Stripe gate enforced (§3 D-10).
//
// Writes to NEW counter_price column (additive — see migration §1) AND keeps
// hmu_counter_price in sync during the v3 transition window so the existing
// /select route + /api/blast/[id] GET continue to behave unchanged.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import {
  writeBlastEvent,
  checkDriverPayoutGate,
  clampCounterPrice,
} from '@/lib/blast/lifecycle';
import { broadcastBlastEvent } from '@/lib/blast/notify';

export const runtime = 'nodejs';

interface CounterBody {
  counterPriceDollars?: number;
}

const DEFAULT_MAX_PCT = 0.25;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;
  const body = (await req.json().catch(() => ({}))) as CounterBody;

  const counterRequested = Number(body.counterPriceDollars);
  if (!Number.isFinite(counterRequested) || counterRequested < 1 || counterRequested > 500) {
    return NextResponse.json(
      { error: 'counterPriceDollars must be between 1 and 500' },
      { status: 400 },
    );
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  const rl = await checkRateLimit({
    key: `blast:counter:${driverUserId}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  const gate = await checkDriverPayoutGate(driverUserId);
  if (!gate.approved) {
    return NextResponse.json(
      { error: 'PAYOUT_ONBOARDING_REQUIRED', reason: gate.reason, payout_onboarding_url: '/driver/payout-setup' },
      { status: 402 },
    );
  }

  // Pull blast + per-market clamp pct from blast_config (falls back to 0.25).
  const blastRows = await sql`
    SELECT id, price, market_id
      FROM hmu_posts
     WHERE id = ${blastId} AND post_type = 'blast' AND status = 'active'
     LIMIT 1
  `;
  if (!blastRows.length) {
    return NextResponse.json({ error: 'Blast not active' }, { status: 404 });
  }
  const blast = blastRows[0] as { id: string; price: string; market_id: string | null };
  const askDollars = Number(blast.price);

  // Per-market counter_offer_max_pct lookup. Joins markets row → blast_config
  // row by slug. NULL market_slug acts as global default.
  let maxPct = DEFAULT_MAX_PCT;
  try {
    const cfgRows = await sql`
      SELECT bc.counter_offer_max_pct
        FROM markets m
        LEFT JOIN blast_config bc
          ON bc.market_slug = m.slug OR bc.market_slug IS NULL
       WHERE m.id = ${blast.market_id}
       ORDER BY (bc.market_slug IS NOT NULL) DESC
       LIMIT 1
    `;
    if (cfgRows.length) {
      const v = (cfgRows[0] as { counter_offer_max_pct: string | null }).counter_offer_max_pct;
      if (v != null) maxPct = Number(v);
    }
  } catch {
    // Fall back to default if blast_config / per-market lookup fails.
  }

  const { clamped, wasClamped, min, max } = clampCounterPrice(askDollars, counterRequested, maxPct);

  // Atomic update — only first responder wins.
  // counter_price + hmu_counter_price both written for the additive transition
  // window per contract §3 D-11. New readers prefer counter_price.
  // hmu_at is also stamped because countering implies interest.
  const updated = await sql`
    UPDATE blast_driver_targets
       SET counter_price = ${clamped},
           hmu_counter_price = ${clamped},
           hmu_at = COALESCE(hmu_at, NOW()),
           passed_at = NULL
     WHERE id = ${targetId}
       AND blast_id = ${blastId}
       AND driver_id = ${driverUserId}
       AND passed_at IS NULL
       AND selected_at IS NULL
       AND pull_up_at IS NULL
     RETURNING id, hmu_at, counter_price, match_score
  `;
  if (!updated.length) {
    return NextResponse.json(
      { error: 'CONFLICT', message: 'Target no longer accepting counters' },
      { status: 409 },
    );
  }
  const row = updated[0] as {
    id: string;
    hmu_at: string;
    counter_price: string;
    match_score: number;
  };

  const driverRows = await sql`
    SELECT u.id, dp.handle, dp.display_name, dp.video_url, dp.vehicle_info,
           u.chill_score, u.tier
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
     WHERE u.id = ${driverUserId}
     LIMIT 1
  `;
  const driver = driverRows[0] as Record<string, unknown> | undefined;

  void writeBlastEvent({
    blastId,
    driverId: driverUserId,
    eventType: 'counter',
    source: 'driver_action',
    data: {
      counterPrice: clamped,
      requested: counterRequested,
      wasClamped,
      askDollars,
      maxPct,
    },
  });

  // Same payload shape as target_hmu so the client reducer treats it as an
  // upsert to the targets list — it just renders the counter price.
  void broadcastBlastEvent(blastId, 'target_counter', {
    targetId: row.id,
    blastId,
    driverId: driverUserId,
    matchScore: Number(row.match_score),
    hmuAt: row.hmu_at,
    counterPrice: Number(row.counter_price),
    passedAt: null,
    selectedAt: null,
    rejectedAt: null,
    driver: driver
      ? {
          handle: driver.handle,
          displayName: driver.display_name,
          videoUrl: driver.video_url,
          vehicle: driver.vehicle_info,
          chillScore: Number(driver.chill_score ?? 0),
          tier: driver.tier,
        }
      : null,
  });

  return NextResponse.json({
    counterAt: row.hmu_at,
    counterPrice: Number(row.counter_price),
    wasClamped,
    band: { min, max },
  });
}
