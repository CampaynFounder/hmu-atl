// POST /api/blast — create a blast booking from an authenticated rider.
//
// Spec: docs/BLAST-BOOKING-SPEC.md §5.1
//
// LAX CREATION MODEL (founder direction 2026-05-13):
//   Creating a blast is permissive — no card required, no minimum match count.
//   Matching still runs and filters who gets the SMS / push, but a 0-match
//   result does not block creation. The deposit hold + card collection are
//   deferred to the match-acceptance step (/api/blast/[id]/select). Goal: get
//   riders into the funnel and convert them to paying customers when they
//   actually pick a driver.
//
// Orchestration:
//   1. Auth (Clerk) + photo gate (rider_profiles.avatar_url required)
//   2. Validate body (pickup/dropoff coords, scheduled_for ≥ now+5m, etc.)
//   3. Feature flag check (blast_booking)
//   4. Rate limit (per-rider, per-IP) via existing checkRateLimit + persist hit
//   5. Resolve market; bail if blast not enabled in market
//   6. Run matching algorithm (0 results is OK — blast still creates)
//   7. Insert hmu_posts row + blast_driver_targets rows (deposit columns null)
//   8. Fanout (Ably push + voip.ms SMS) — fire-and-forget; no-op if 0 targets
//   9. Publish blast_created on blast:{id} channel
//   10. Return { blastId, expiresAt, targetedCount, shortcode }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { calculateDistance } from '@/lib/geo/distance';
import { getMatchingConfig, getKnob } from '@/lib/blast/config';
import { matchBlast, fetchFallbackDrivers } from '@/lib/blast/matching';
import { fanoutBlast, type BlastTarget, type BlastNotificationContext } from '@/lib/blast/notify';
import { publishToChannel } from '@/lib/ably/server';

export const runtime = 'nodejs';

// Bump on every deploy so the response confirms which build is live.
// If the response detail says BUILD_TAG !== '2026-05-13-instr-1', the worker
// is serving stale code (cache, queued deploy, wrong branch).
const BUILD_TAG = '2026-05-14-bump-expand-pref';

// Wrap every awaited sql call with this so the error message tells us which
// query threw. We've been chasing "$8" without knowing whether it's
// fetchCandidates, fetchFallbackDrivers, the INSERT, or something else.
// Default T to any[] to match the original `await sql\`...\`` behavior;
// callsites cast individual rows after .length / [0] checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runQuery<T = any[]>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const orig = e instanceof Error ? e.message : String(e);
    const enhanced: Error & { queryName?: string; pgCode?: unknown; pgPosition?: unknown; pgWhere?: unknown; pgInternalQuery?: unknown; original?: unknown } = new Error(`[query:${name}] ${orig}`);
    enhanced.queryName = name;
    if (e && typeof e === 'object') {
      const obj = e as Record<string, unknown>;
      enhanced.pgCode = obj.code;
      enhanced.pgPosition = obj.position;
      enhanced.pgWhere = obj.where;
      enhanced.pgInternalQuery = obj.internalQuery;
      enhanced.original = e;
    }
    throw enhanced;
  }
}

interface BlastBody {
  pickup?: { lat?: number; lng?: number; address?: string };
  dropoff?: { lat?: number; lng?: number; address?: string };
  trip_type?: 'one_way' | 'round_trip';
  scheduled_for?: string | null; // ISO timestamp; null = "now"
  storage?: boolean;
  driver_preference?: 'male' | 'female' | 'any';
  price_dollars?: number;
}

const SCHEDULED_FOR_MIN_LEAD_MIN = 5;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function generateShortcode(): string {
  // 7-char URL-safe shortcode for SMS deep links. Collision is checked at
  // insert via UNIQUE constraint (added below); regen on conflict.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 7; i += 1) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function shortLabel(address: string | undefined, lat: number, lng: number): string {
  if (address) {
    // Take the first comma-separated segment; if too long, truncate.
    const seg = address.split(',')[0].trim();
    return seg.length > 24 ? seg.slice(0, 22) + '…' : seg;
  }
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

function whenLabel(scheduledFor: Date | null): string {
  if (!scheduledFor) return 'now';
  const minutes = Math.round((scheduledFor.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 12) return `in ~${hours}h`;
  // For >12h out, give a coarse marker. No timezone tokens (per founder rule).
  const local = new Date(scheduledFor.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (local.toDateString() === tomorrow.toDateString()) return 'tomorrow';
  return local.toLocaleDateString('en-US', { weekday: 'short' });
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ──
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRows = await runQuery('lookup_user_by_clerk_id', () => sql`
      SELECT u.id, u.gender, rp.avatar_url, rp.stripe_customer_id, rp.display_name
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `);
    if (!userRows.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const user = userRows[0] as Record<string, unknown>;
    const riderId = user.id as string;
    const riderGender = (user.gender as string | null) ?? null;

    // ── 1a. Feature flag ──
    if (!(await isFeatureEnabled('blast_booking', { userId: riderId }))) {
      return NextResponse.json({ error: 'Blast booking not available' }, { status: 404 });
    }

    // ── 2. Photo gate ──
    if (!user.avatar_url) {
      return NextResponse.json(
        { error: 'PHOTO_REQUIRED', message: 'Upload a profile photo before sending a blast' },
        { status: 412 },
      );
    }

    // ── 3. Body validation ──
    const body = (await req.json().catch(() => ({}))) as BlastBody;

    const pickupLat = body.pickup?.lat;
    const pickupLng = body.pickup?.lng;
    const dropoffLat = body.dropoff?.lat;
    const dropoffLng = body.dropoff?.lng;

    if (
      typeof pickupLat !== 'number' ||
      typeof pickupLng !== 'number' ||
      typeof dropoffLat !== 'number' ||
      typeof dropoffLng !== 'number' ||
      Math.abs(pickupLat) > 90 || Math.abs(dropoffLat) > 90 ||
      Math.abs(pickupLng) > 180 || Math.abs(dropoffLng) > 180
    ) {
      return NextResponse.json({ error: 'Invalid pickup or dropoff coordinates' }, { status: 400 });
    }

    const tripType = body.trip_type === 'round_trip' ? 'round_trip' : 'one_way';
    const driverPreference = body.driver_preference === 'male' || body.driver_preference === 'female'
      ? body.driver_preference
      : 'any';
    const storageRequested = Boolean(body.storage);

    let scheduledFor: Date | null = null;
    if (body.scheduled_for) {
      const parsed = new Date(body.scheduled_for);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid scheduled_for' }, { status: 400 });
      }
      const minLead = Date.now() + SCHEDULED_FOR_MIN_LEAD_MIN * 60_000;
      if (parsed.getTime() < minLead) {
        return NextResponse.json(
          { error: `scheduled_for must be at least ${SCHEDULED_FOR_MIN_LEAD_MIN} minutes in the future` },
          { status: 400 },
        );
      }
      scheduledFor = parsed;
    }

    const config = await getMatchingConfig();
    const priceDollars = Number(body.price_dollars ?? config.default_price_dollars);
    if (!Number.isFinite(priceDollars) || priceDollars < 1 || priceDollars > config.max_price_dollars) {
      return NextResponse.json(
        { error: `price_dollars must be between $1 and $${config.max_price_dollars}` },
        { status: 400 },
      );
    }

    // ── 4. Rate limit ──
    // 0 on either knob = check disabled (admin can knob-out without code change).
    const ip = clientIp(req);
    const [perHour, perDay] = await Promise.all([
      getKnob<number>('blast.rate_limit_per_phone_hour', 5),
      getKnob<number>('blast.rate_limit_per_phone_day', 20),
    ]);
    const checks = await Promise.all([
      perHour > 0
        ? checkRateLimit({ key: `blast:user:${riderId}:hour`, limit: perHour, windowSeconds: 3600 })
        : Promise.resolve({ ok: true, retryAfterSeconds: 0 }),
      perDay > 0
        ? checkRateLimit({ key: `blast:user:${riderId}:day`, limit: perDay, windowSeconds: 86400 })
        : Promise.resolve({ ok: true, retryAfterSeconds: 0 }),
    ]);
    const [hourLimit, dayLimit] = checks;
    if (!hourLimit.ok || !dayLimit.ok) {
      const retry = Math.max(hourLimit.retryAfterSeconds, dayLimit.retryAfterSeconds);
      // Persist rate-limit hit for admin review (per spec §9).
      sql`
        INSERT INTO blast_rate_limits (identifier_kind, identifier_value, blast_count, window_end)
        VALUES ('user_id', ${riderId}, 1, NOW() + INTERVAL '1 hour')
        ON CONFLICT (identifier_kind, identifier_value, window_end)
        DO UPDATE SET blast_count = blast_rate_limits.blast_count + 1
      `.catch(() => {});
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterSeconds: retry },
        { status: 429, headers: { 'Retry-After': String(retry) } },
      );
    }
    void ip; // Per-IP cap handled by /api/blast/draft pre-auth (future); for auth'd we use user_id.

    // ── 5. Market resolution + per-market enable ──
    const market = await resolveMarketForUser(riderId);
    const marketEnabledRows = await runQuery('lookup_market_blast_enabled', () => sql`
      SELECT blast_enabled FROM markets WHERE id = ${market.market_id} LIMIT 1
    `);
    if (!marketEnabledRows.length || !(marketEnabledRows[0] as { blast_enabled: boolean }).blast_enabled) {
      return NextResponse.json(
        { error: 'Blast booking not available in your market yet' },
        { status: 403 },
      );
    }

    // ── 6. Matching ──
    const { targets: scoredTargets, finalRadiusMi, expansionsUsed } = await matchBlast(
      {
        riderId,
        pickupLat,
        pickupLng,
        marketId: market.market_id,
        driverPreference,
        riderGender,
        scheduledFor,
      },
      config,
    );

    // Lax creation: 0 matches is fine. The offer board will say "still hunting"
    // and the bump button can widen the radius. Drivers coming online after
    // creation can also be added on bump. See lax-creation note at top.

    // Fetch fallback drivers if we ran 2 iterations and still have < 3 matches
    let fallbackDrivers: Awaited<ReturnType<typeof fetchFallbackDrivers>> = [];
    if (expansionsUsed >= 2 && scoredTargets.length < 3) {
      fallbackDrivers = await fetchFallbackDrivers(
        {
          riderId,
          pickupLat,
          pickupLng,
          marketId: market.market_id,
          driverPreference,
          riderGender,
          scheduledFor,
        },
        config,
        priceDollars,
      );
    }

    // Use a UUID for the blast id up front so any client retry hits the same
    // INSERT. (No deposit PI here — that moves to /api/blast/[id]/select.)
    const blastIdRows = await runQuery('gen_blast_id', () => sql`SELECT gen_random_uuid() AS id`);
    const blastId = (blastIdRows[0] as { id: string }).id;

    // ── 7. Persist blast + targets ──
    const expiresAt = new Date(Date.now() + config.expiry.default_blast_minutes * 60_000);
    const distanceMi = calculateDistance(
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: dropoffLat, longitude: dropoffLng },
    );

    // Generate a shortcode for the SMS deep link. Collisions retry up to 3x.
    let shortcode = generateShortcode();
    for (let i = 0; i < 3; i += 1) {
      const exists = await runQuery('shortcode_collision_check', () => sql`
        SELECT 1 FROM hmu_posts WHERE areas[1] = ${`shortcode:${shortcode}`} LIMIT 1
      `);
      if (!exists.length) break;
      shortcode = generateShortcode();
    }

    // Insert blast row. We piggy-back the shortcode in areas[0] for now (cheap
    // index-free lookup); the spec calls for a dedicated column in Phase 2.
    // deposit_payment_intent_id + deposit_amount are NULL here. They get
    // populated at /api/blast/[id]/select when the rider picks a driver and
    // the deposit hold actually fires.
    await runQuery('insert_hmu_posts', () => sql`
      INSERT INTO hmu_posts (
        id, user_id, post_type, status, areas, price, time_window,
        pickup_lat, pickup_lng, pickup_address,
        dropoff_lat, dropoff_lng, dropoff_address,
        trip_type, scheduled_for, storage_requested, driver_preference,
        market_id, expires_at
      ) VALUES (
        ${blastId}, ${riderId}, 'blast', 'active',
        ARRAY[${`shortcode:${shortcode}`}, ${market.slug}],
        ${priceDollars},
        ${JSON.stringify({
          shortcode,
          tripType,
          scheduledFor: scheduledFor?.toISOString() ?? null,
          distanceMi: Math.round(distanceMi * 100) / 100,
        })}::jsonb,
        ${pickupLat}, ${pickupLng}, ${body.pickup?.address ?? null},
        ${dropoffLat}, ${dropoffLng}, ${body.dropoff?.address ?? null},
        ${tripType}, ${scheduledFor}, ${storageRequested}, ${driverPreference},
        ${market.market_id}, ${expiresAt}
      )
    `);

    // Insert per-target audit rows. UNIQUE(blast_id, driver_id) guards
    // accidental dupes if matching ever returns the same driver twice.
    const targetIds: { id: string; driverId: string; matchScore: number; distanceMi: number }[] = [];
    for (const t of scoredTargets) {
      const inserted = await runQuery('insert_blast_driver_target', () => sql`
        INSERT INTO blast_driver_targets (
          blast_id, driver_id, match_score, score_breakdown,
          notification_channels
        ) VALUES (
          ${blastId}, ${t.driverId}, ${t.matchScore},
          ${JSON.stringify(t.scoreBreakdown)}::jsonb,
          ARRAY[]::text[]
        )
        ON CONFLICT (blast_id, driver_id) DO UPDATE
          SET match_score = EXCLUDED.match_score,
              score_breakdown = EXCLUDED.score_breakdown
        RETURNING id
      `);
      const row = inserted[0] as { id: string };
      targetIds.push({ id: row.id, driverId: t.driverId, matchScore: t.matchScore, distanceMi: t.distanceMi });
    }

    // Insert fallback drivers with notified_at = NULL (not auto-notified)
    // Rider manually triggers HMU for these via separate API endpoint
    for (const f of fallbackDrivers) {
      await runQuery('insert_blast_driver_target_fallback', () => sql`
        INSERT INTO blast_driver_targets (
          blast_id, driver_id, match_score, score_breakdown,
          notification_channels, notified_at
        ) VALUES (
          ${blastId}, ${f.driverId}, ${f.matchScore},
          ${JSON.stringify(f.scoreBreakdown)}::jsonb,
          ARRAY[]::text[],
          NULL
        )
        ON CONFLICT (blast_id, driver_id) DO NOTHING
      `);
    }

    // ── 8. Fanout (fire-and-forget; do not await) ──
    const fanoutTargets: BlastTarget[] = targetIds.map((t) => ({
      targetId: t.id,
      driverId: t.driverId,
      matchScore: t.matchScore,
      distanceMi: t.distanceMi,
    }));
    const ctx: BlastNotificationContext = {
      blastId,
      riderDisplayName: (user.display_name as string) ?? 'A rider',
      pickupLabel: shortLabel(body.pickup?.address, pickupLat, pickupLng),
      dropoffLabel: shortLabel(body.dropoff?.address, dropoffLat, dropoffLng),
      priceDollars,
      scheduledForLabel: whenLabel(scheduledFor),
      marketSlug: market.slug,
      shortcode,
    };
    // Worker-friendly fire-and-forget: detach from the request promise. The
    // Cloudflare runtime will keep this task alive briefly via the global
    // event loop. For longer fanouts we'd switch to a Queue.
    void fanoutBlast(fanoutTargets, ctx);

    // ── 9. Publish to blast channel for the rider's live offer board ──
    publishToChannel(`blast:${blastId}`, 'blast_created', {
      blastId,
      expiresAt: expiresAt.toISOString(),
      targetedCount: targetIds.length,
      finalRadiusMi,
      expansionsUsed,
    }).catch(() => {});

    return NextResponse.json({
      blastId,
      shortcode,
      expiresAt: expiresAt.toISOString(),
      targetedCount: targetIds.length,
      finalRadiusMi,
      expansionsUsed,
      buildTag: BUILD_TAG,
    });
  } catch (e) {
    console.error('[blast] POST failed:', e);
    // Surface every diagnostic we have. buildTag confirms the deployed version;
    // queryName tells us WHICH sql call threw; pgCode/pgPosition/pgWhere/
    // pgInternalQuery come from the Postgres error object when present.
    // This is verbose on purpose — once $8 is solved we can dial it back.
    const err = e as Record<string, unknown>;
    return NextResponse.json(
      {
        error: 'Internal error',
        detail: e instanceof Error ? e.message : String(e),
        buildTag: BUILD_TAG,
        queryName: err.queryName ?? null,
        pgCode: err.pgCode ?? null,
        pgPosition: err.pgPosition ?? null,
        pgWhere: err.pgWhere ?? null,
        pgInternalQuery: err.pgInternalQuery ?? null,
        stack: e instanceof Error ? e.stack?.split('\n').slice(0, 8).join('\n') : null,
      },
      { status: 500 },
    );
  }
}
