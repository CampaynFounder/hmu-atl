import { sql } from '@/lib/db/client';

export interface MarketContext {
  market_id: string;
  slug: string;
  name: string;
  timezone: string;
  subdomain?: string | null;
  center_lat?: number | null;
  center_lng?: number | null;
  radius_miles?: number | null;
  status?: string | null;
  sms_did?: string | null;
}

export const DEFAULT_MARKET_SLUG = 'atl';

// Keep in sync with the `x-market-slug` header set by middleware for subdomain
// requests. Lowercase, matches `markets.subdomain`.
export const MARKET_SLUG_HEADER = 'x-market-slug';

type Cached = { loadedAt: number; ctx: MarketContext };
const cache = new Map<string, Cached>();
const TTL_MS = 300_000;

async function fetchBySlug(slug: string): Promise<MarketContext | null> {
  const rows = await sql`
    SELECT id AS market_id, slug, name, timezone, subdomain, status,
           center_lat::float8 AS center_lat,
           center_lng::float8 AS center_lng,
           radius_miles, sms_did
    FROM markets WHERE slug = ${slug} LIMIT 1
  `;
  return (rows[0] as MarketContext) || null;
}

async function fetchById(id: string): Promise<MarketContext | null> {
  const rows = await sql`
    SELECT id AS market_id, slug, name, timezone, subdomain, status,
           center_lat::float8 AS center_lat,
           center_lng::float8 AS center_lng,
           radius_miles, sms_did
    FROM markets WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as MarketContext) || null;
}

async function fetchBySubdomain(subdomain: string): Promise<MarketContext | null> {
  const rows = await sql`
    SELECT id AS market_id, slug, name, timezone, subdomain, status,
           center_lat::float8 AS center_lat,
           center_lng::float8 AS center_lng,
           radius_miles, sms_did
    FROM markets WHERE subdomain = ${subdomain} LIMIT 1
  `;
  return (rows[0] as MarketContext) || null;
}

/**
 * Resolve the market context for a given user. Trusts users.market_id first;
 * if null, falls back to the default live market (`atl`). Never trust a
 * client-sent market_id.
 */
export async function resolveMarketForUser(userId: string): Promise<MarketContext> {
  const rows = await sql`SELECT market_id FROM users WHERE id = ${userId} LIMIT 1`;
  const marketId = (rows[0] as { market_id: string | null })?.market_id;

  if (marketId) {
    const cached = cache.get(marketId);
    if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.ctx;
    const ctx = await fetchById(marketId);
    if (ctx) {
      cache.set(marketId, { loadedAt: Date.now(), ctx });
      return ctx;
    }
  }

  const fallback = await fetchBySlug(DEFAULT_MARKET_SLUG);
  if (!fallback) throw new Error('No live market configured');
  return fallback;
}

export async function resolveMarketBySlug(slug: string): Promise<MarketContext | null> {
  return fetchBySlug(slug);
}

/**
 * Parse a Host header, extract the subdomain, and resolve to a market.
 * Returns null when the host doesn't match a known market subdomain — callers
 * should fall back to DEFAULT_MARKET_SLUG.
 *
 * Examples:
 *   'atl.hmucashride.com'       → market with subdomain='atl'
 *   'nola.hmucashride.com'      → market with subdomain='nola'
 *   'hmucashride.com'           → null (apex, no subdomain)
 *   'localhost:3000'            → null (dev host)
 *   'some-preview.workers.dev'  → null
 */
export async function resolveMarketFromHost(host: string | null | undefined): Promise<MarketContext | null> {
  if (!host) return null;
  // Strip port if present
  const bare = host.toLowerCase().split(':')[0];
  // Must be a subdomain of hmucashride.com — refuse anything else (prevents
  // spoofed Host headers on preview domains resolving to a real market).
  if (!bare.endsWith('.hmucashride.com')) return null;
  const subdomain = bare.slice(0, -('.hmucashride.com'.length));
  // Multi-level subdomains (e.g. 'clerk.atl.hmucashride.com') ignored — Clerk
  // and similar infra subdomains should never resolve to a market.
  if (!subdomain || subdomain.includes('.')) return null;
  return fetchBySubdomain(subdomain);
}

export async function resolveMarketFromHeaders(headers: Headers): Promise<MarketContext | null> {
  const slug = headers.get(MARKET_SLUG_HEADER);
  if (!slug) return null;
  return fetchBySlug(slug);
}

export function feedChannelForMarket(slug: string): string {
  return `market:${slug}:feed`;
}
