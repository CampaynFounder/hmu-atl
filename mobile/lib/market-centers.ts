// Client-side market centers + labels. Ported from the backend's
// lib/markets/geo.ts (MARKET_CENTERS) — the edge/native runtimes can't hit the
// DB, so they keep an inline copy (the backend does the same in middleware).
// Keep in sync when markets are added there. Used to center maps and default
// coords on the driver's market instead of hardcoding Atlanta.
export const DEFAULT_MARKET_SLUG = 'atl';

export interface MarketCenter {
  lat: number;
  lng: number;
}

export const MARKET_CENTERS: Record<string, MarketCenter> = {
  atl:   { lat: 33.7490, lng: -84.3880 },
  nola:  { lat: 29.9511, lng: -90.0715 },
  aug:   { lat: 33.4735, lng: -82.0105 },
  macon: { lat: 32.8407, lng: -83.6324 },
  sav:   { lat: 32.0809, lng: -81.0912 },
  vld:   { lat: 30.8327, lng: -83.2785 },
  csg:   { lat: 32.4610, lng: -84.9877 },
  tpa:   { lat: 27.9506, lng: -82.4572 },
  mia:   { lat: 26.0000, lng: -80.2000 },
  orl:   { lat: 28.5383, lng: -81.3792 },
  mem:   { lat: 35.1495, lng: -90.0490 },
  bna:   { lat: 36.1627, lng: -86.7816 },
  knx:   { lat: 35.9606, lng: -83.9207 },
  cha:   { lat: 35.0456, lng: -85.3097 },
  bhm:   { lat: 33.5186, lng: -86.8104 },
  mgm:   { lat: 32.3668, lng: -86.3000 },
  hou:   { lat: 29.7604, lng: -95.3698 },
  dfw:   { lat: 32.7767, lng: -96.7970 },
  clt:   { lat: 35.2271, lng: -80.8431 },
  chi:   { lat: 41.8781, lng: -87.6298 },
  dtw:   { lat: 42.3314, lng: -83.0458 },
  stl:   { lat: 38.6270, lng: -90.1994 },
  cin:   { lat: 39.1031, lng: -84.5120 },
};

// The slug stamped into Clerk unsafeMetadata.market at sign-up. Falls back to
// the default market for existing/OAuth users who never got one.
export function getUserMarketSlug(unsafeMetadata: unknown): string {
  const slug = (unsafeMetadata as { market?: unknown } | null | undefined)?.market;
  return typeof slug === 'string' && slug in MARKET_CENTERS ? slug : DEFAULT_MARKET_SLUG;
}

export function getMarketCenter(slug: string | null | undefined): MarketCenter {
  return (slug && MARKET_CENTERS[slug]) || MARKET_CENTERS[DEFAULT_MARKET_SLUG];
}

// Mapbox expects [longitude, latitude] order.
export function getMarketCenterLngLat(slug: string | null | undefined): [number, number] {
  const c = getMarketCenter(slug);
  return [c.lng, c.lat];
}

const MARKET_LABEL_OVERRIDES: Record<string, string> = {};

// Short label for UI copy, e.g. 'ATL', 'NOLA'. Uppercased slug covers every
// market; add an override only when that isn't the wanted label.
export function getMarketLabel(slug: string | null | undefined): string {
  const s = slug || DEFAULT_MARKET_SLUG;
  return MARKET_LABEL_OVERRIDES[s] ?? s.toUpperCase();
}

export function getUserMarketLabel(unsafeMetadata: unknown): string {
  return getMarketLabel(getUserMarketSlug(unsafeMetadata));
}
