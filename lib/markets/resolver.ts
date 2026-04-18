import { sql } from '@/lib/db/client';

export interface MarketContext {
  market_id: string;
  slug: string;
  name: string;
  timezone: string;
}

const DEFAULT_MARKET_SLUG = 'atl';

type Cached = { loadedAt: number; ctx: MarketContext };
const cache = new Map<string, Cached>();
const TTL_MS = 300_000;

async function fetchBySlug(slug: string): Promise<MarketContext | null> {
  const rows = await sql`
    SELECT id AS market_id, slug, name, timezone
    FROM markets
    WHERE slug = ${slug}
    LIMIT 1
  `;
  return (rows[0] as MarketContext) || null;
}

async function fetchById(id: string): Promise<MarketContext | null> {
  const rows = await sql`
    SELECT id AS market_id, slug, name, timezone
    FROM markets
    WHERE id = ${id}
    LIMIT 1
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

export function feedChannelForMarket(slug: string): string {
  return `market:${slug}:feed`;
}
