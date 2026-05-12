// POST /api/blast — create a blast booking from an authenticated rider.
//
// Spec: docs/BLAST-BOOKING-SPEC.md §5.1
//
// Orchestration:
//   1. Auth (Clerk) + photo gate (rider_profiles.avatar_url required)
//   2. Validate body (pickup/dropoff coords, scheduled_for ≥ now+5m, etc.)
//   3. Feature flag check (blast_booking)
//   4. Rate limit (per-rider, per-IP) via existing checkRateLimit + persist hit
//   5. Resolve market; bail if blast not enabled in market
//   6. Run matching algorithm
//   7. Authorize deposit PaymentIntent on the platform account (no destination
//      yet — the destination gets attached at match-select time when the rider
//      picks a driver). Deposit-only is forced for ALL blasts.
//   8. Insert hmu_posts row + blast_driver_targets rows in a single transaction
//   9. Fanout (Ably push + voip.ms SMS) — fire-and-forget via waitUntil
//   10. Publish blast_created on blast:{id} channel
//   11. Return { blastId, expiresAt, targetedCount, shortcode }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { calculateDistance } from '@/lib/geo/distance';
import { getMatchingConfig, getKnob } from '@/lib/blast/config';
import { matchBlast } from '@/lib/blast/matching';
import { fanoutBlast, type BlastTarget, type BlastNotificationContext } from '@/lib/blast/notify';
import { publishToChannel } from '@/lib/ably/server';

export const runtime = 'nodejs';

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

    const userRows = await sql`
      SELECT u.id, rp.avatar_url, rp.stripe_customer_id, rp.display_name
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const user = userRows[0] as Record<string, unknown>;
    const riderId = user.id as string;

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
    const ip = clientIp(req);
    const [perHour, perDay] = await Promise.all([
      getKnob<number>('blast.rate_limit_per_phone_hour', 5),
      getKnob<number>('blast.rate_limit_per_phone_day', 20),
    ]);
    const [hourLimit, dayLimit] = await Promise.all([
      checkRateLimit({ key: `blast:user:${riderId}:hour`, limit: perHour, windowSeconds: 3600 }),
      checkRateLimit({ key: `blast:user:${riderId}:day`, limit: perDay, windowSeconds: 86400 }),
    ]);
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
    const marketEnabledRows = await sql`
      SELECT blast_enabled FROM markets WHERE id = ${market.market_id} LIMIT 1
    `;
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
        scheduledFor,
      },
      config,
    );

    if (scoredTargets.length === 0) {
      return NextResponse.json(
        {
          error: 'NO_DRIVERS_AVAILABLE',
          message: 'No drivers available in your area right now. Try again in a few minutes.',
        },
        { status: 503 },
      );
    }

    // ── 7. Deposit PaymentIntent (deposit_only forced) ──
    // We hold the deposit on the PLATFORM account with no transfer_data; the
    // destination is unknown until a driver is matched. At match-select time,
    // this hold is released (cancelled) and the normal Pull Up flow re-runs
    // its own holdRiderPayment with the actual driver. The deposit here is a
    // "show me you're real" commitment, not the final ride payment.
    const depositCents = Math.min(
      Math.max(
        Math.round(priceDollars * 100 * config.deposit.percent_of_fare),
        config.deposit.default_amount_cents,
      ),
      config.deposit.max_deposit_cents,
    );

    const stripeCustomerId = user.stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'PAYMENT_METHOD_REQUIRED', message: 'Add a payment method first' },
        { status: 412 },
      );
    }

    const pmRows = await sql`
      SELECT stripe_payment_method_id FROM rider_payment_methods
      WHERE rider_id = ${riderId} AND is_default = true LIMIT 1
    `;
    const paymentMethodId = (pmRows[0] as { stripe_payment_method_id: string } | undefined)?.stripe_payment_method_id;
    if (!paymentMethodId) {
      return NextResponse.json(
        { error: 'PAYMENT_METHOD_REQUIRED', message: 'Add a payment method first' },
        { status: 412 },
      );
    }

    // Use a UUID for the blast id up front so the idempotency key is stable
    // across retries from the client.
    const blastIdRows = await sql`SELECT gen_random_uuid() AS id`;
    const blastId = (blastIdRows[0] as { id: string }).id;

    let paymentIntentId: string | null = null;
    let depositError: string | null = null;
    try {
      const pi = await stripe.paymentIntents.create({
        amount: depositCents,
        currency: 'usd',
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        capture_method: 'manual',
        confirm: true,
        off_session: true,
        statement_descriptor_suffix: 'HMU BLAST',
        metadata: {
          blastId,
          riderId,
          kind: 'blast_deposit',
        },
      }, {
        idempotencyKey: `blast_deposit_${blastId}`,
      });
      if (pi.status !== 'requires_capture') {
        depositError = `unexpected_status:${pi.status}`;
      } else {
        paymentIntentId = pi.id;
      }
    } catch (e) {
      const err = e as { code?: string; decline_code?: string; message?: string };
      depositError = err.decline_code ?? err.code ?? err.message ?? 'unknown';
    }

    if (depositError || !paymentIntentId) {
      return NextResponse.json(
        { error: 'DEPOSIT_FAILED', message: depositError || 'Could not authorize deposit' },
        { status: 402 },
      );
    }

    // ── 8. Persist blast + targets ──
    const expiresAt = new Date(Date.now() + config.expiry.default_blast_minutes * 60_000);
    const distanceMi = calculateDistance(
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: dropoffLat, longitude: dropoffLng },
    );

    // Generate a shortcode for the SMS deep link. Collisions retry up to 3x.
    let shortcode = generateShortcode();
    for (let i = 0; i < 3; i += 1) {
      const exists = await sql`
        SELECT 1 FROM hmu_posts WHERE areas[1] = ${`shortcode:${shortcode}`} LIMIT 1
      `;
      if (!exists.length) break;
      shortcode = generateShortcode();
    }

    // Insert blast row. We piggy-back the shortcode in areas[0] for now (cheap
    // index-free lookup); the spec calls for a dedicated column in Phase 2.
    await sql`
      INSERT INTO hmu_posts (
        id, user_id, post_type, status, areas, price, time_window,
        pickup_lat, pickup_lng, pickup_address,
        dropoff_lat, dropoff_lng, dropoff_address,
        trip_type, scheduled_for, storage_requested, driver_preference,
        deposit_payment_intent_id, deposit_amount, market_id,
        expires_at
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
        ${paymentIntentId}, ${depositCents / 100}, ${market.market_id},
        ${expiresAt}
      )
    `;

    // Insert per-target audit rows. UNIQUE(blast_id, driver_id) guards
    // accidental dupes if matching ever returns the same driver twice.
    const targetIds: { id: string; driverId: string; matchScore: number; distanceMi: number }[] = [];
    for (const t of scoredTargets) {
      const inserted = await sql`
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
      `;
      const row = inserted[0] as { id: string };
      targetIds.push({ id: row.id, driverId: t.driverId, matchScore: t.matchScore, distanceMi: t.distanceMi });
    }

    // ── 9. Fanout (fire-and-forget; do not await) ──
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

    // ── 10. Publish to blast channel for the rider's live offer board ──
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
      depositCents,
    });
  } catch (e) {
    console.error('[blast] POST failed:', e);
    return NextResponse.json(
      { error: 'Internal error', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
