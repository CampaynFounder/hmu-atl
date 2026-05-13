// POST /api/blast/[id]/bump — rider increases price + we re-match wider.
// Body: { additional_dollars: number }
//
// Behavior: bump price, re-run matching with expanded radius, notify only NEW
// candidates (drivers already in the target list aren't re-pinged).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { getMatchingConfig } from '@/lib/blast/config';
import { matchBlast } from '@/lib/blast/matching';
import { fanoutBlast, type BlastTarget, type BlastNotificationContext } from '@/lib/blast/notify';
import { publishToChannel } from '@/lib/ably/server';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId } = await params;
  const body = (await req.json().catch(() => ({}))) as { additional_dollars?: number };
  const additional = Number(body.additional_dollars ?? 5);
  if (!Number.isFinite(additional) || additional < 1 || additional > 50) {
    return NextResponse.json({ error: 'additional_dollars must be 1–50' }, { status: 400 });
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  const postRows = await sql`
    SELECT id, price, pickup_lat, pickup_lng, driver_preference, scheduled_for,
           market_id, time_window, areas, expires_at, bump_count
    FROM hmu_posts
    WHERE id = ${blastId} AND post_type = 'blast' AND user_id = ${riderId}
      AND status = 'active' AND expires_at > NOW()
    LIMIT 1
  `;
  if (!postRows.length) {
    return NextResponse.json({ error: 'Blast not active' }, { status: 404 });
  }
  const post = postRows[0] as Record<string, unknown>;

  const newPrice = Number(post.price) + additional;
  const config = await getMatchingConfig();
  if (newPrice > config.max_price_dollars) {
    return NextResponse.json(
      { error: `New price would exceed max ($${config.max_price_dollars})` },
      { status: 400 },
    );
  }

  const market = await resolveMarketForUser(riderId);

  // Use a wider radius for the bump pass. Each bump expands by half the
  // base radius until the absolute max is hit.
  const expandedConfig = {
    ...config,
    filters: {
      ...config.filters,
      max_distance_mi: Math.min(
        config.filters.max_distance_mi * (1 + 0.5 * (Number(post.bump_count ?? 0) + 1)),
        config.limits.expand_radius_max_mi,
      ),
    },
  };

  // Pull rider's stored gender so the matching SQL can honor drivers'
  // rider_gender_pref filter on the bump just like the initial blast did.
  const genderRows = await sql`SELECT gender FROM users WHERE id = ${riderId} LIMIT 1`;
  const riderGender = (genderRows[0] as { gender: string | null } | undefined)?.gender ?? null;

  const { targets: scored } = await matchBlast(
    {
      riderId,
      pickupLat: Number(post.pickup_lat),
      pickupLng: Number(post.pickup_lng),
      marketId: market.market_id,
      driverPreference: (post.driver_preference as 'male' | 'female' | 'any') ?? 'any',
      riderGender,
      scheduledFor: post.scheduled_for ? new Date(post.scheduled_for as string) : null,
    },
    expandedConfig,
  );

  if (scored.length === 0) {
    return NextResponse.json(
      { error: 'NO_NEW_DRIVERS', message: 'Already notified everyone we can find. Try a different time.' },
      { status: 503 },
    );
  }

  // Skip drivers already in the target list — bump only notifies fresh blood.
  const existing = await sql`
    SELECT driver_id FROM blast_driver_targets WHERE blast_id = ${blastId}
  `;
  const existingIds = new Set(existing.map((r: unknown) => (r as { driver_id: string }).driver_id));
  const newCandidates = scored.filter((t) => !existingIds.has(t.driverId));
  if (newCandidates.length === 0) {
    // No new candidates, but still bump the price for any future HMU's value.
    await sql`
      UPDATE hmu_posts
         SET price = ${newPrice},
             bump_count = COALESCE(bump_count, 0) + 1
       WHERE id = ${blastId}
    `;
    return NextResponse.json({ bumped: true, newPrice, newCandidates: 0 });
  }

  const targetIds: { id: string; driverId: string; matchScore: number; distanceMi: number }[] = [];
  for (const t of newCandidates) {
    const inserted = await sql`
      INSERT INTO blast_driver_targets (blast_id, driver_id, match_score, score_breakdown, notification_channels)
      VALUES (${blastId}, ${t.driverId}, ${t.matchScore}, ${JSON.stringify(t.scoreBreakdown)}::jsonb, ARRAY[]::text[])
      ON CONFLICT (blast_id, driver_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length) {
      targetIds.push({ id: (inserted[0] as { id: string }).id, driverId: t.driverId, matchScore: t.matchScore, distanceMi: t.distanceMi });
    }
  }

  await sql`
    UPDATE hmu_posts
       SET price = ${newPrice},
           bump_count = COALESCE(bump_count, 0) + 1
     WHERE id = ${blastId}
  `;

  // Fanout to new candidates only.
  const tw = (post.time_window as Record<string, unknown>) ?? {};
  const ctx: BlastNotificationContext = {
    blastId,
    riderDisplayName: 'A rider',
    pickupLabel: 'pickup',
    dropoffLabel: 'dropoff',
    priceDollars: newPrice,
    scheduledForLabel: post.scheduled_for ? 'soon' : 'now',
    marketSlug: market.slug,
    shortcode: (tw.shortcode as string) ?? '',
  };
  void fanoutBlast(targetIds.map<BlastTarget>((t) => ({
    targetId: t.id,
    driverId: t.driverId,
    matchScore: t.matchScore,
    distanceMi: t.distanceMi,
  })), ctx);

  publishToChannel(`blast:${blastId}`, 'bumped', { blastId, newPrice, newCandidates: targetIds.length }).catch(() => {});

  return NextResponse.json({ bumped: true, newPrice, newCandidates: targetIds.length });
}
