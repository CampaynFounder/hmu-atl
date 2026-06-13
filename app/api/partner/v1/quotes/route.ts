// POST /api/partner/v1/quotes — partner-authenticated trip pricing.
//
// Reuses the same fare/deposit math as the public /api/blast/estimate, scoped
// to the partner's market when a market_slug is supplied. Returns the trip
// price and deposit so the vendor can show a number before booking.
//
// The HMAC signature is computed over the raw request body, so we read the
// body once as text, authenticate, then parse it.

import { NextRequest, NextResponse } from 'next/server';
import { calculateDistance, isValidCoordinates } from '@/lib/geo/distance';
import { getMatchingConfig } from '@/lib/blast/config';
import { computeBlastFare, computeBlastDepositCents } from '@/lib/blast/pricing';
import { authenticatePartner } from '@/lib/partner/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface QuoteBody {
  pickup?: { lat?: unknown; lng?: unknown };
  dropoff?: { lat?: unknown; lng?: unknown };
  stops?: Array<{ lat?: unknown; lng?: unknown }>;
  market_slug?: unknown;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const auth = await authenticatePartner(req, rawBody, 'quotes:read');
  if (!auth.ok) return auth.res;

  let body: QuoteBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as QuoteBody) : {};
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
  }

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
      { error: 'bad_request', message: 'pickup and dropoff must each be { lat: number, lng: number }' },
      { status: 400 },
    );
  }

  const pickupCoords = { latitude: pickup.lat, longitude: pickup.lng };
  const dropoffCoords = { latitude: dropoff.lat, longitude: dropoff.lng };
  if (!isValidCoordinates(pickupCoords) || !isValidCoordinates(dropoffCoords)) {
    return NextResponse.json({ error: 'bad_request', message: 'Coordinates out of range' }, { status: 400 });
  }

  const validStops = Array.isArray(body.stops)
    ? body.stops
        .filter((s): s is { lat: number; lng: number } =>
          typeof s?.lat === 'number' && typeof s?.lng === 'number')
        .map((s) => ({ latitude: s.lat, longitude: s.lng }))
        .filter(isValidCoordinates)
    : [];
  const waypoints = [pickupCoords, ...validStops, dropoffCoords];
  let distanceMi = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    distanceMi += calculateDistance(waypoints[i], waypoints[i + 1]);
  }

  const marketSlug =
    typeof body.market_slug === 'string' && body.market_slug.length > 0
      ? body.market_slug.toLowerCase()
      : null;

  const config = await getMatchingConfig(marketSlug);
  const fare = computeBlastFare({ distanceMi, config });
  const depositCents = computeBlastDepositCents({ fareCents: fare.suggestedPriceCents, config });

  return NextResponse.json({
    distance_mi: fare.distanceMi,
    estimated_minutes: fare.estimatedMinutes,
    suggested_price_dollars: fare.suggestedPriceDollars,
    suggested_price_cents: fare.suggestedPriceCents,
    deposit_cents: depositCents,
    deposit_dollars: depositCents / 100,
    breakdown: fare.breakdown,
    market_slug: marketSlug,
  });
}
