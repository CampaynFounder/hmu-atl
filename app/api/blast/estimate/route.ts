// POST /api/blast/estimate — pre-auth pricing estimate for the blast form.
// No auth required: returns distance + suggested price + deposit so the
// rider can see the number before they're asked to sign in.
//
// Reads `blast_matching_v1` for price_per_mile, default_price, max_price,
// and deposit policy. Cached 60s by getPlatformConfig.
//
// Rate-limited per IP via the existing rate_limit_counters table — generous
// limit (30/hour/IP per spec §9) since this is just math, no money moves.

import { NextRequest, NextResponse } from 'next/server';
import { calculateDistance, isValidCoordinates } from '@/lib/geo/distance';
import { getPlatformConfig } from '@/lib/platform-config/get';
import { checkRateLimit } from '@/lib/rate-limit/check';

export const runtime = 'nodejs';

type BlastMatchingConfig = {
  default_price_dollars: number;
  price_per_mile_dollars: number;
  max_price_dollars: number;
  deposit: {
    default_amount_cents: number;
    percent_of_fare: number;
    max_deposit_cents: number;
  };
} & Record<string, unknown>;

const DEFAULTS: BlastMatchingConfig = {
  default_price_dollars: 25,
  price_per_mile_dollars: 2.0,
  max_price_dollars: 200,
  deposit: {
    default_amount_cents: 500,
    percent_of_fare: 0.5,
    max_deposit_cents: 5000,
  },
};

interface EstimateBody {
  pickup?: { lat?: unknown; lng?: unknown };
  dropoff?: { lat?: unknown; lng?: unknown };
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

  const config = await getPlatformConfig<BlastMatchingConfig>(
    'blast_matching_v1',
    DEFAULTS,
  );

  const distanceMi = calculateDistance(pickupCoords, dropoffCoords);

  // Suggested price: distance × per-mile, floored at the configured default
  // (so a 0.5-mi trip doesn't quote $1) and capped at the configured max.
  // Round to whole dollars — the form's chip stepper is +$5 / -$5.
  const rawPrice = distanceMi * config.price_per_mile_dollars;
  const flooredPrice = Math.max(rawPrice, config.default_price_dollars);
  const cappedPrice = Math.min(flooredPrice, config.max_price_dollars);
  const suggestedPriceDollars = Math.round(cappedPrice);

  // Deposit: percent_of_fare with default floor and max ceiling.
  const fareCents = suggestedPriceDollars * 100;
  const percentDepositCents = Math.round(fareCents * config.deposit.percent_of_fare);
  const flooredDepositCents = Math.max(
    percentDepositCents,
    config.deposit.default_amount_cents,
  );
  const depositCents = Math.min(flooredDepositCents, config.deposit.max_deposit_cents);

  return NextResponse.json({
    distance_mi: Math.round(distanceMi * 100) / 100,
    suggested_price_dollars: suggestedPriceDollars,
    suggested_price_cents: fareCents,
    deposit_cents: depositCents,
    deposit_dollars: depositCents / 100,
    pricing: {
      price_per_mile_dollars: config.price_per_mile_dollars,
      min_price_dollars: config.default_price_dollars,
      max_price_dollars: config.max_price_dollars,
    },
  });
}
