// POST /api/blast/[id]/expand — rider linked their card and wants more drivers.
//
// Requires a saved payment method (rider just came through the inline card form).
// Re-runs the matching algorithm with the next radius expansion step, inserts
// only NEW targets (UNIQUE constraint prevents double-notifying existing ones),
// and fires the fanout for the new drivers.
//
// Returns { added: number } — how many new drivers were queued.

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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  // Verify blast belongs to rider and is still active
  const blastRows = await sql`
    SELECT
      hp.id, hp.price, hp.status, hp.expires_at, hp.shortcode,
      hp.pickup_lat, hp.pickup_lng, hp.pickup_address,
      hp.dropoff_lat, hp.dropoff_lng, hp.dropoff_address,
      hp.driver_preference, hp.scheduled_for, hp.market_id,
      COALESCE(rp.display_name, rp.first_name, 'Rider') AS rider_display_name
    FROM hmu_posts hp
    LEFT JOIN rider_profiles rp ON rp.user_id = hp.user_id
    WHERE hp.id = ${blastId} AND hp.post_type = 'blast' AND hp.user_id = ${riderId}
    LIMIT 1
  `;
  if (!blastRows.length) return NextResponse.json({ error: 'Blast not found' }, { status: 404 });
  const blast = blastRows[0] as Record<string, unknown>;

  if (blast.status !== 'active') {
    return NextResponse.json({ error: 'Blast is no longer active' }, { status: 400 });
  }
  if (new Date(blast.expires_at as string).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Blast has expired' }, { status: 400 });
  }

  // Require a saved payment method
  const pmRows = await sql`
    SELECT id FROM rider_payment_methods WHERE rider_id = ${riderId} LIMIT 1
  `;
  if (!pmRows.length) {
    return NextResponse.json(
      { error: 'PAYMENT_METHOD_REQUIRED', message: 'Link a card first' },
      { status: 412 },
    );
  }

  const market = await resolveMarketForUser(riderId);
  const config = await getMatchingConfig(market?.slug ?? 'atl');

  // Expand by doubling the radius ceiling for this run.
  const expandedConfig = {
    ...config,
    limits: {
      ...config.limits,
      expand_radius_max_mi: (config.limits?.expand_radius_max_mi ?? 15) * 2,
      min_drivers_to_notify: 1,
    },
  };

  const matchResult = await matchBlast(
    {
      riderId,
      pickupLat: Number(blast.pickup_lat),
      pickupLng: Number(blast.pickup_lng),
      marketId: blast.market_id as string,
      driverPreference: (blast.driver_preference as 'male' | 'female' | 'any') ?? 'any',
      riderGender: null,
      scheduledFor: blast.scheduled_for ? new Date(blast.scheduled_for as string) : null,
    },
    expandedConfig,
  );

  const newTargets = matchResult.targets;
  if (newTargets.length === 0) {
    return NextResponse.json({ added: 0, message: 'No additional drivers found in expanded area' });
  }

  // Persist new targets — let DB generate UUIDs. ON CONFLICT skips existing drivers.
  const insertedRows = await sql`
    INSERT INTO blast_driver_targets (blast_id, driver_id, match_score, score_breakdown)
    SELECT
      ${blastId},
      t.driver_id,
      t.match_score,
      t.score_breakdown::jsonb
    FROM jsonb_to_recordset(${JSON.stringify(
      newTargets.map((t) => ({
        driver_id: t.driverId,
        match_score: t.matchScore,
        score_breakdown: t.scoreBreakdown ?? {},
      }))
    )}::jsonb) AS t(driver_id uuid, match_score numeric, score_breakdown jsonb)
    ON CONFLICT (blast_id, driver_id) DO NOTHING
    RETURNING id, driver_id, match_score
  `;

  if (!insertedRows.length) {
    return NextResponse.json({ added: 0, message: 'All matched drivers already in the target list' });
  }

  // Fanout notifications to truly new drivers only
  const shortLabel = (address: string | null | undefined, lat: number, lng: number) => {
    if (address) {
      const seg = (address as string).split(',')[0].trim();
      return seg.length > 24 ? seg.slice(0, 22) + '…' : seg;
    }
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  };

  const ctx: BlastNotificationContext = {
    blastId,
    riderDisplayName: blast.rider_display_name as string,
    pickupLabel: shortLabel(blast.pickup_address as string, Number(blast.pickup_lat), Number(blast.pickup_lng)),
    dropoffLabel: shortLabel(blast.dropoff_address as string, Number(blast.dropoff_lat), Number(blast.dropoff_lng)),
    priceDollars: Number(blast.price),
    scheduledForLabel: blast.scheduled_for ? 'scheduled' : 'now',
    marketSlug: market?.slug ?? 'atl',
    shortcode: blast.shortcode as string,
  };

  const blastTargets: BlastTarget[] = (insertedRows as Array<{ id: string; driver_id: string; match_score: number }>).map((row) => {
    const scored = newTargets.find((t) => t.driverId === row.driver_id);
    return {
      targetId: row.id,
      driverId: row.driver_id,
      matchScore: Number(row.match_score),
      distanceMi: scored?.distanceMi ?? 0,
    };
  });

  await fanoutBlast(blastTargets, ctx).catch((e) =>
    console.error('expand fanout error', e),
  );

  // Tell the offer board to refresh
  await publishToChannel(`blast:${blastId}`, 'blast_bumped', {
    reason: 'expand',
    added: newTargets.length,
  }).catch(() => {});

  return NextResponse.json({ added: newTargets.length });
}
