import { resolveAreaLabel } from './areas';

export interface ParsedRoute {
  pickup_area_slug: string | null;
  dropoff_area_slug: string | null;
  dropoff_in_market: boolean;
}

const ROUTE_SEPARATORS = [' > ', ' → ', ' -> ', '->', ' to ', ' → ', '>'];

/**
 * Split a natural-language route string like "buckhead > airport $25" or
 * "midtown to decatur" into pickup/dropoff halves. Price tokens (`$25`),
 * trailing prose, and filler words (from/to/pickup/dropoff/@) are stripped.
 */
function splitRoute(input: string): { pickup: string | null; dropoff: string | null } {
  const cleaned = input
    .replace(/\$\d+(?:\.\d{1,2})?/g, ' ')
    .replace(/\b(pickup|pick up|dropoff|drop off|at|@)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return { pickup: null, dropoff: null };

  for (const sep of ROUTE_SEPARATORS) {
    const idx = cleaned.toLowerCase().indexOf(sep);
    if (idx === -1) continue;
    const pickup = cleaned.slice(0, idx).replace(/^from\s+/i, '').trim();
    const dropoff = cleaned.slice(idx + sep.length).trim();
    if (pickup && dropoff) return { pickup, dropoff };
  }

  return { pickup: cleaned.replace(/^from\s+/i, '').trim(), dropoff: null };
}

/**
 * Parse a freeform route description against a market's area catalog.
 * Returns resolved pickup/dropoff slugs (or null if unmatched) plus a
 * `dropoff_in_market` flag for long-distance detection.
 */
export async function parseRoute(input: string, marketId: string): Promise<ParsedRoute> {
  const { pickup, dropoff } = splitRoute(input || '');

  const [pickupArea, dropoffArea] = await Promise.all([
    pickup ? resolveAreaLabel(marketId, pickup) : Promise.resolve(null),
    dropoff ? resolveAreaLabel(marketId, dropoff) : Promise.resolve(null),
  ]);

  return {
    pickup_area_slug: pickupArea?.slug ?? null,
    dropoff_area_slug: dropoffArea?.slug ?? null,
    // If rider gave a dropoff that didn't match any area, treat as out-of-market
    dropoff_in_market: dropoff ? dropoffArea !== null : true,
  };
}

/**
 * Resolve pickup/dropoff slugs that came from the UI (tapped chips). Both
 * inputs optional — unmatched slugs drop to null. Does NOT fall back to
 * natural-language parsing; callers that want that should invoke `parseRoute`
 * first and merge.
 */
export async function resolveProvidedSlugs(
  marketId: string,
  pickupSlug: string | null | undefined,
  dropoffSlug: string | null | undefined,
): Promise<ParsedRoute> {
  const [pickup, dropoff] = await Promise.all([
    pickupSlug ? resolveAreaLabel(marketId, pickupSlug) : Promise.resolve(null),
    dropoffSlug ? resolveAreaLabel(marketId, dropoffSlug) : Promise.resolve(null),
  ]);

  return {
    pickup_area_slug: pickup?.slug ?? null,
    dropoff_area_slug: dropoff?.slug ?? null,
    dropoff_in_market: dropoffSlug ? dropoff !== null : true,
  };
}
