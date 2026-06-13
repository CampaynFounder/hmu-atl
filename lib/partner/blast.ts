// Partner blasts — broadcast a delivery/ride request to many matched drivers,
// let them respond (HMU/counter/pass) in their app, then the vendor selects a
// winner. Selection folds into the SAME partner_bookings + hold/capture/complete
// lifecycle as a direct delivery (so /complete + /cancel + webhooks all work).
//
// Reuses the internal matching engine. Only drivers who opted into partner
// bookings (and are payout-ready) are targeted.

import { sql } from '@/lib/db/client';
import { isValidCoordinates } from '@/lib/geo/distance';
import { resolveMarketBySlug } from '@/lib/markets/resolver';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getMatchingConfig } from '@/lib/blast/config';
import { getMatchingProvider, InternalMatcher } from '@/lib/blast/provider';
import type { BlastConfig as V3BlastConfig, BlastCreateInput } from '@/lib/blast/types';
import { notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { generateRefCode } from '@/lib/rides/ref-code';
import { resolveFeePolicy, computeDeliverySplit } from '@/lib/partner/fees';
import { resolvePartnerRider } from '@/lib/partner/rider';
import { maybePlacePartnerHold } from '@/lib/partner/booking-hold';
import { dispatchPartnerEvent } from '@/lib/partner/webhooks';
import type { PartnerContext } from '@/lib/partner/auth';

interface Coord { lat?: unknown; lng?: unknown; address?: unknown }

export interface BlastInput {
  external_rider?: { ref?: unknown; name?: unknown; phone?: unknown };
  pickup?: Coord;
  dropoff?: Coord;
  delivery_fee_cents?: unknown;
  market_slug?: unknown;
}

type Result<T> = { ok: true; data: T } | { ok: false; httpStatus: number; error: string; message: string };
const fail = (httpStatus: number, error: string, message: string): Result<never> => ({ ok: false, httpStatus, error, message });

function coord(c: Coord | undefined): { lat: number; lng: number; address: string | null } | null {
  if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
  if (!isValidCoordinates({ latitude: c.lat, longitude: c.lng })) return null;
  return { lat: c.lat, lng: c.lng, address: typeof c.address === 'string' ? c.address : null };
}

function shortcode(): string {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alpha[b % alpha.length]).join('');
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createPartnerBlast(
  ctx: PartnerContext,
  body: BlastInput,
): Promise<Result<{ blastId: string; targetedCount: number; expiresAt: string; feeSplit: Record<string, number> }>> {
  const partner = ctx.partner;
  const extRef = typeof body.external_rider?.ref === 'string' ? body.external_rider.ref.trim() : '';
  if (!extRef) return fail(400, 'bad_request', 'external_rider.ref is required');
  const pickup = coord(body.pickup);
  const dropoff = coord(body.dropoff);
  if (!pickup || !dropoff) return fail(400, 'bad_request', 'pickup and dropoff must each be { lat, lng }');
  const deliveryFeeCents = Number(body.delivery_fee_cents);
  if (!Number.isInteger(deliveryFeeCents) || deliveryFeeCents <= 0) {
    return fail(400, 'bad_request', 'delivery_fee_cents must be a positive integer');
  }
  const marketSlug = typeof body.market_slug === 'string' ? body.market_slug.toLowerCase() : '';
  if (!marketSlug) return fail(400, 'bad_request', 'market_slug is required');

  const market = await resolveMarketBySlug(marketSlug);
  if (!market) return fail(400, 'unknown_market', `No market '${marketSlug}'`);
  if (partner.marketIds.length > 0 && !partner.marketIds.includes(market.market_id)) {
    return fail(403, 'market_not_allowed', 'Partner is not enabled for this market');
  }
  if (!(await isFeatureEnabled('partner_blasts', { marketSlug }))) {
    return fail(404, 'not_available', 'Partner blasts are not enabled');
  }

  const rider = await resolvePartnerRider(
    { id: partner.id, payerMode: partner.payerMode, vendorStripeCustomerId: partner.vendorStripeCustomerId },
    { ref: extRef, name: typeof body.external_rider?.name === 'string' ? body.external_rider.name : null, phone: null },
    market.market_id,
  );

  const priceDollars = deliveryFeeCents / 100;
  const policy = await resolveFeePolicy(marketSlug);
  const split = computeDeliverySplit({ deliveryFeeCents, policy });

  // Match drivers via the internal matcher.
  const config = await getMatchingConfig(market.slug);
  const v3Config = {
    weights: config.weights as unknown as Record<string, number>,
    hardFilters: config.filters as unknown as Record<string, unknown>,
    limits: config.limits as unknown as Record<string, number | boolean>,
    rewardFunction: 'revenue_per_blast',
    counterOfferMaxPct: 0.25,
    feedMinScorePercentile: 0,
    nlpChipOnly: false,
    configVersion: 1,
  } as unknown as V3BlastConfig;
  const v3Input: BlastCreateInput = {
    pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address ?? '' },
    dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address ?? '' },
    tripType: 'one_way',
    scheduledFor: null,
    storage: false,
    priceDollars,
    riderGender: null,
    driverPreference: { preferred: [], strict: false },
    maxPickupMinutes: null,
    draftCreatedAt: Date.now(),
    marketSlug: market.slug,
  } as unknown as BlastCreateInput;

  const provider = getMatchingProvider(market.slug);
  const matchResult = await (provider as InternalMatcher).matchInternal(v3Input, v3Config, {
    riderId: rider.userId,
    marketId: market.market_id,
    driverPreference: 'any',
    riderGender: null,
  });
  const matched = [...matchResult.extras.rawTargets, ...matchResult.extras.rawFallback];

  // Only target drivers who consented to partner bookings and can be paid out.
  const matchedIds = matched.map((t) => t.driverId);
  const consentRows = matchedIds.length
    ? await sql`
        SELECT user_id FROM driver_profiles
        WHERE user_id = ANY(${matchedIds}::uuid[])
          AND accept_partner_bookings = true
          AND payout_setup_complete = true
          AND stripe_account_id IS NOT NULL
      `
    : [];
  const consenting = new Set((consentRows as { user_id: string }[]).map((r) => r.user_id));
  const targets = matched.filter((t) => consenting.has(t.driverId));

  const code = shortcode();
  const expiryMinutes = config.expiry?.default_blast_minutes ?? 15;
  const inserted = await sql`
    INSERT INTO hmu_posts (
      user_id, post_type, status, areas, shortcode, price, time_window,
      pickup_lat, pickup_lng, pickup_address,
      dropoff_lat, dropoff_lng, dropoff_address,
      trip_type, driver_preference, market_id, expires_at
    ) VALUES (
      ${rider.userId}, 'blast', 'active',
      ARRAY[${`shortcode:${code}`}, ${market.slug}], ${code},
      ${priceDollars},
      ${JSON.stringify({ shortcode: code, partner_blast: true })}::jsonb,
      ${pickup.lat}, ${pickup.lng}, ${pickup.address},
      ${dropoff.lat}, ${dropoff.lng}, ${dropoff.address},
      'one_way', 'any', ${market.market_id},
      NOW() + make_interval(mins => ${expiryMinutes})
    )
    RETURNING id, expires_at
  `;
  const blastId = (inserted[0] as { id: string }).id;
  const expiresAt = String((inserted[0] as { expires_at: string }).expires_at);

  // Insert targets (notified immediately — the partner isn't swiping a deck) and ping each driver.
  for (const t of targets) {
    await sql`
      INSERT INTO blast_driver_targets (blast_id, driver_id, match_score, score_breakdown, notification_channels, notified_at)
      VALUES (${blastId}, ${t.driverId}, ${t.matchScore}, ${JSON.stringify(t.scoreBreakdown ?? {})}::jsonb, ARRAY['push']::text[], NOW())
      ON CONFLICT (blast_id, driver_id) DO NOTHING
    `;
    notifyUser(t.driverId, 'partner_blast_request', {
      blastId, price: priceDollars, pickup: pickup.address, dropoff: dropoff.address, partner: partner.name,
    }).catch(() => {});
  }

  publishAdminEvent('partner_blast_created', { blastId, partnerId: partner.id, targetedCount: targets.length }).catch(() => {});
  dispatchPartnerEvent(partner.id, 'booking.created', {
    booking_id: blastId, status: 'blast_active', kind: 'blast', targeted_count: targets.length,
    fee_split: { delivery_fee_cents: split.deliveryFeeCents, platform_fee_cents: split.platformFeeCents, driver_payout_cents: split.driverPayoutCents },
  }).catch(() => {});

  return {
    ok: true,
    data: {
      blastId,
      targetedCount: targets.length,
      expiresAt,
      feeSplit: { delivery_fee_cents: split.deliveryFeeCents, platform_fee_cents: split.platformFeeCents, driver_payout_cents: split.driverPayoutCents },
    },
  };
}

// ---------------------------------------------------------------------------
// Offers (driver responses)
// ---------------------------------------------------------------------------
async function authorizeBlast(partnerId: string, blastId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM hmu_posts hp
    JOIN partner_riders pr ON pr.user_id = hp.user_id AND pr.partner_id = ${partnerId}
    WHERE hp.id = ${blastId} AND hp.post_type = 'blast'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function listPartnerBlastOffers(
  ctx: PartnerContext,
  blastId: string,
): Promise<Result<{ blastId: string; status: string; offers: unknown[] }>> {
  if (!(await authorizeBlast(ctx.partner.id, blastId))) return fail(404, 'not_found', 'Blast not found');

  const blastRows = await sql`SELECT status FROM hmu_posts WHERE id = ${blastId} LIMIT 1`;
  const status = (blastRows[0] as { status: string } | undefined)?.status ?? 'unknown';

  const rows = await sql`
    SELECT bdt.id AS target_id, bdt.driver_id, bdt.hmu_at, bdt.passed_at,
           bdt.hmu_counter_price, bdt.match_score, bdt.selected_at,
           dp.handle, dp.display_name, dp.pricing, u.chill_score
    FROM blast_driver_targets bdt
    JOIN driver_profiles dp ON dp.user_id = bdt.driver_id
    JOIN users u ON u.id = bdt.driver_id
    WHERE bdt.blast_id = ${blastId}
    ORDER BY (bdt.hmu_at IS NOT NULL) DESC, bdt.match_score DESC NULLS LAST
  `;
  const offers = (rows as Record<string, unknown>[]).map((r) => ({
    target_id: r.target_id,
    driver_handle: r.handle,
    display_name: (r.display_name as string) || (r.handle as string),
    chill_score: Number(r.chill_score ?? 0),
    match_score: Number(r.match_score ?? 0),
    responded: r.hmu_at != null,
    passed: r.passed_at != null,
    selected: r.selected_at != null,
    counter_price_cents: r.hmu_counter_price != null ? Math.round(Number(r.hmu_counter_price) * 100) : null,
  }));
  return { ok: true, data: { blastId, status, offers } };
}

// ---------------------------------------------------------------------------
// Select winner → ride + hold (reuses partner_bookings lifecycle)
// ---------------------------------------------------------------------------
export async function selectPartnerBlastDriver(
  ctx: PartnerContext,
  blastId: string,
  targetId: string,
): Promise<Result<{ bookingId: string; rideId: string; driverId: string }>> {
  const partner = ctx.partner;
  if (!(await authorizeBlast(partner.id, blastId))) return fail(404, 'not_found', 'Blast not found');

  // The target must belong to this blast.
  const tRows = await sql`SELECT driver_id FROM blast_driver_targets WHERE id = ${targetId} AND blast_id = ${blastId} LIMIT 1`;
  const target = tRows[0] as { driver_id: string } | undefined;
  if (!target) return fail(404, 'not_found', 'Target not found for this blast');
  const driverId = target.driver_id;

  // Atomic claim: only the first select wins, and only while still active.
  const claim = await sql`
    UPDATE hmu_posts SET status = 'matched'
    WHERE id = ${blastId} AND post_type = 'blast' AND status = 'active' AND expires_at > NOW()
    RETURNING user_id, price, pickup_address, pickup_lat, pickup_lng,
              dropoff_address, dropoff_lat, dropoff_lng, market_id
  `;
  if (!claim.length) return fail(409, 'conflict', 'Blast already matched, cancelled, or expired');
  const blast = claim[0] as Record<string, unknown>;
  const riderId = blast.user_id as string;
  const priceDollars = Number(blast.price);
  const deliveryFeeCents = Math.round(priceDollars * 100);

  const policy = await resolveFeePolicy(undefined);
  const marketRow = blast.market_id ? await sql`SELECT slug FROM markets WHERE id = ${blast.market_id} LIMIT 1` : [];
  const marketSlug = (marketRow[0] as { slug: string } | undefined)?.slug;
  const split = computeDeliverySplit({ deliveryFeeCents, policy: marketSlug ? await resolveFeePolicy(marketSlug) : policy });

  // Create the ride.
  const refCode = generateRefCode();
  const rideRows = await sql`
    INSERT INTO rides (
      driver_id, rider_id, status, amount, final_agreed_price, price_mode, price_accepted_at,
      hmu_post_id, agreement_summary, dispute_window_minutes, is_cash, ref_code,
      pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, trip_type
    ) VALUES (
      ${driverId}, ${riderId}, 'matched', ${priceDollars}, ${priceDollars}, 'proposed', NOW(),
      ${blastId}, ${JSON.stringify({ source: 'partner_blast', pickup: blast.pickup_address, dropoff: blast.dropoff_address })}::jsonb,
      ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')}, FALSE, ${refCode},
      ${blast.pickup_address}, ${blast.pickup_lat}, ${blast.pickup_lng},
      ${blast.dropoff_address}, ${blast.dropoff_lat}, ${blast.dropoff_lng}, 'one_way'
    )
    RETURNING id
  `;
  const rideId = (rideRows[0] as { id: string }).id;

  // Mark the winner + losers.
  await sql`UPDATE blast_driver_targets SET selected_at = NOW() WHERE id = ${targetId}`;
  await sql`UPDATE blast_driver_targets SET rejected_at = NOW()
            WHERE blast_id = ${blastId} AND id != ${targetId} AND selected_at IS NULL AND rejected_at IS NULL`;

  // Create the partner_bookings ledger row (pending_accept) so the shared hold
  // logic + /complete + /cancel apply, then place the hold immediately (the
  // driver already opted in by HMU-ing).
  await sql`
    INSERT INTO partner_bookings (
      partner_id, post_id, ride_id, rider_id, driver_id, market_id, external_ref,
      delivery_fee_cents, platform_fee_cents, driver_payout_cents, status
    ) VALUES (
      ${partner.id}, ${blastId}, ${rideId}, ${riderId}, ${driverId}, ${blast.market_id},
      (SELECT external_ref FROM partner_riders WHERE user_id = ${riderId} AND partner_id = ${partner.id} LIMIT 1),
      ${split.deliveryFeeCents}, ${split.platformFeeCents}, ${split.driverPayoutCents}, 'pending_accept'
    )
    ON CONFLICT (post_id) DO NOTHING
  `;
  await maybePlacePartnerHold(blastId, rideId, driverId);

  notifyUser(driverId, 'booking_accepted', { rideId, postId: blastId, message: 'You won the blast!' }).catch(() => {});
  publishAdminEvent('partner_blast_selected', { blastId, rideId, driverId, partnerId: partner.id }).catch(() => {});

  return { ok: true, data: { bookingId: blastId, rideId, driverId } };
}
