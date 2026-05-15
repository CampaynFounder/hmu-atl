// POST /api/blast/estimate — pre-auth pricing estimate for the blast form.
// No auth required: returns distance + suggested price + deposit so the
// rider can see the number before they're asked to sign in.
//
// Reads `blast_matching_v1` (deep-merged with `blast_matching_v1:market:{slug}`
// when market_slug is supplied) for the full pricing formula. Cached 60s by
// getPlatformConfig. Rate-limited 30/hour/IP since this is just math.

import { NextRequest, NextResponse } from 'next/server';
import { calculateDistance, isValidCoordinates } from '@/lib/geo/distance';
import { getMatchingConfig } from '@/lib/blast/config';
import { computeBlastFare, computeBlastDepositCents } from '@/lib/blast/pricing';
import { checkRateLimit } from '@/lib/rate-limit/check';

export const runtime = 'nodejs';

interface EstimateBody {
  pickup?: { lat?: unknown; lng?: unknown };
  dropoff?: { lat?: unknown; lng?: unknown };
  market_slug?: unknown;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  return 'unknown';
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit({
    key: `blast:estimate:${clientIp(req)}`,
    limit: 30,
    windowSeconds: 3600,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as EstimateBody;

  const pickup = body.pickup;
  const dropoff = body.dropoff;

  if (
    !pickup ||
    !dropoff ||
    typeof pickup.lat !== 'number' ||
    typeof pickup.lng !== 'number' ||
    typeof dropoff.lat !== 'number' ||
    typeof dropoff.lng !== 'number'
  ) {
    return NextResponse.json(
      { error: 'pickup and dropoff must each be { lat: number, lng: number }' },
      { status: 400 },
    );
  }

  const pickupCoords = { latitude: pickup.lat, longitude: pickup.lng };
  const dropoffCoords = { latitude: dropoff.lat, longitude: dropoff.lng };

  if (!isValidCoordinates(pickupCoords) || !isValidCoordinates(dropoffCoords)) {
    return NextResponse.json(
      { error: 'Coordinates out of range' },
      { status: 400 },
    );
  }

  const marketSlug =
    typeof body.market_slug === 'string' && body.market_slug.length > 0
      ? body.market_slug.toLowerCase()
      : null;
  const config = await getMatchingConfig(marketSlug);

  const distanceMi = calculateDistance(pickupCoords, dropoffCoords);
  const fare = computeBlastFare({ distanceMi, config });
  const depositCents = computeBlastDepositCents({
    fareCents: fare.suggestedPriceCents,
    config,
  });

  return NextResponse.json({
    distance_mi: fare.distanceMi,
    estimated_minutes: fare.estimatedMinutes,
    suggested_price_dollars: fare.suggestedPriceDollars,
    suggested_price_cents: fare.suggestedPriceCents,
    deposit_cents: depositCents,
    deposit_dollars: depositCents / 100,
    breakdown: fare.breakdown,
    pricing: {
      base_fare_dollars: config.base_fare_dollars,
      price_per_mile_dollars: config.price_per_mile_dollars,
      per_minute_cents: config.per_minute_cents,
      assumed_mph: config.assumed_mph,
      minimum_fare_dollars: config.minimum_fare_dollars,
      max_price_dollars: config.max_price_dollars,
      default_price_dollars: config.default_price_dollars,
      market_slug: marketSlug,
    },
  });
}
