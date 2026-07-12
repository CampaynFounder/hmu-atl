import { sql } from '@/lib/db/client';

// Market geo-centers used to map a lat/lng to a market slug. This is the single
// source of truth for server-side geo resolution — both the authed
// `/api/markets/active-check` and the public `/api/public/market-check` import
// from here. The edge `middleware.ts` keeps its own inline copy (no DB access in
// the edge runtime); keep the two in sync when adding markets.
export const MARKET_CENTERS = [
  { slug: 'atl',   lat: 33.7490, lng: -84.3880, radiusMiles: 60  },
  { slug: 'nola',  lat: 29.9511, lng: -90.0715, radiusMiles: 50  },
  { slug: 'aug',   lat: 33.4735, lng: -82.0105, radiusMiles: 30  },
  { slug: 'macon', lat: 32.8407, lng: -83.6324, radiusMiles: 30  },
  { slug: 'sav',   lat: 32.0809, lng: -81.0912, radiusMiles: 30  },
  { slug: 'vld',   lat: 30.8327, lng: -83.2785, radiusMiles: 25  },
  { slug: 'csg',   lat: 32.4610, lng: -84.9877, radiusMiles: 25  },
  { slug: 'tpa',   lat: 27.9506, lng: -82.4572, radiusMiles: 40  },
  { slug: 'mia',   lat: 26.0000, lng: -80.2000, radiusMiles: 40  },
  { slug: 'orl',   lat: 28.5383, lng: -81.3792, radiusMiles: 35  },
  { slug: 'mem',   lat: 35.1495, lng: -90.0490, radiusMiles: 40  },
  { slug: 'bna',   lat: 36.1627, lng: -86.7816, radiusMiles: 40  },
  { slug: 'knx',   lat: 35.9606, lng: -83.9207, radiusMiles: 30  },
  { slug: 'cha',   lat: 35.0456, lng: -85.3097, radiusMiles: 30  },
  { slug: 'bhm',   lat: 33.5186, lng: -86.8104, radiusMiles: 35  },
  { slug: 'mgm',   lat: 32.3668, lng: -86.3000, radiusMiles: 30  },
  { slug: 'hou',   lat: 29.7604, lng: -95.3698, radiusMiles: 50  },
  { slug: 'dfw',   lat: 32.7767, lng: -96.7970, radiusMiles: 50  },
  { slug: 'clt',   lat: 35.2271, lng: -80.8431, radiusMiles: 35  },
  { slug: 'chi',   lat: 41.8781, lng: -87.6298, radiusMiles: 45  },
  { slug: 'dtw',   lat: 42.3314, lng: -83.0458, radiusMiles: 40  },
  { slug: 'stl',   lat: 38.6270, lng: -90.1994, radiusMiles: 40  },
  { slug: 'cin',   lat: 39.1031, lng: -84.5120, radiusMiles: 35  },
] as const;

export function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nearest market slug within its radius, or null if the point is outside every market. */
export function nearestMarketSlug(lat: number, lng: number): string | null {
  let bestSlug: string | null = null;
  let minDist = Infinity;
  for (const m of MARKET_CENTERS) {
    const d = haversineDistanceMiles(lat, lng, m.lat, m.lng);
    if (d < m.radiusMiles && d < minDist) { minDist = d; bestSlug = m.slug; }
  }
  return bestSlug;
}

export interface GeoMarketResult {
  isActive: boolean;
  marketSlug: string | null;
  displayName: string;
}

// A market is open to users when it's launched. `soft_launch` counts as live
// (public-facing); `setup` and `paused` do not.
const ACTIVE_STATUSES = new Set(['live', 'soft_launch']);

/**
 * Resolve a lat/lng to a market and whether HMU is live there. Maps the point to
 * the nearest market center, then reads its `status` from Neon.
 * - Outside every market center → { isActive: false, marketSlug: null }.
 * - Geo-matched but not seeded in `markets` → treated as active ("not seeded" ≠
 *   "not launched"); only a non-active status blocks users.
 *
 * NOTE: the `markets` table has `status` (setup|soft_launch|live|paused) and
 * `name` — NOT `is_active`/`display_name`. Selecting the latter threw on every
 * call, which silently fell through to the `!rows.length` branch below and made
 * EVERY in-radius point "active" regardless of status. Reading `status` restores
 * real gating.
 */
export async function resolveMarketByGeo(lat: number, lng: number): Promise<GeoMarketResult> {
  const bestSlug = nearestMarketSlug(lat, lng);
  if (!bestSlug) {
    return { isActive: false, marketSlug: null, displayName: 'Your area' };
  }

  const rows = await sql`
    SELECT slug, name, status FROM markets WHERE slug = ${bestSlug} LIMIT 1
  `.catch(() => [] as unknown[]);

  if (!rows.length) {
    return { isActive: true, marketSlug: bestSlug, displayName: bestSlug.toUpperCase() };
  }

  const market = rows[0] as { slug: string; name: string; status: string };
  return {
    isActive: ACTIVE_STATUSES.has(market.status),
    marketSlug: bestSlug,
    displayName: market.name,
  };
}
