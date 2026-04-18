import { sql } from '@/lib/db/client';

export type Cardinal = 'westside' | 'eastside' | 'northside' | 'southside' | 'central';

export interface MarketArea {
  id: string;
  market_id: string;
  slug: string;
  name: string;
  cardinal: Cardinal;
  sort_order: number;
  is_active: boolean;
}

type Cached = { loadedAt: number; rows: MarketArea[]; byLabel: Map<string, MarketArea> };
const cache = new Map<string, Cached>();
const TTL_MS = 60_000;

export async function getMarketAreas(marketId: string): Promise<MarketArea[]> {
  const cached = cache.get(marketId);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.rows;

  const rows = (await sql`
    SELECT id, market_id, slug, name, cardinal, sort_order, is_active
    FROM market_areas
    WHERE market_id = ${marketId} AND is_active = TRUE
    ORDER BY sort_order, slug
  `) as MarketArea[];

  const byLabel = new Map<string, MarketArea>();
  for (const r of rows) {
    byLabel.set(normalizeLabel(r.slug), r);
    byLabel.set(normalizeLabel(r.name), r);
  }
  cache.set(marketId, { loadedAt: Date.now(), rows, byLabel });
  return rows;
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_-]+/g, '-');
}

export function bustAreaCache(marketId?: string) {
  if (marketId) cache.delete(marketId);
  else cache.clear();
}

/** Fuzzy resolve a single user-provided label to a market_areas row. */
export async function resolveAreaLabel(
  marketId: string,
  rawLabel: string,
): Promise<MarketArea | null> {
  const label = rawLabel?.trim();
  if (!label) return null;

  const rows = await getMarketAreas(marketId);
  const lc = normalizeLabel(label);

  // Handle common synonyms BEFORE row lookup
  const synonyms: Record<string, string> = {
    'west-side': 'westside',
    'east-side': 'eastside',
    'south-side': 'southside',
    'north-side': 'northside',
    'south-atl': 'south-atlanta',
    'south-atl.': 'south-atlanta',
    'east-atl': 'east-atlanta',
    'atl-airport': 'airport',
    'hartsfield': 'airport',
    'hartsfield-jackson': 'airport',
    'west-end': 'west-end',
  };
  const target = synonyms[lc] ?? lc;

  const byLabel = cache.get(marketId)?.byLabel;
  const exact = byLabel?.get(target);
  if (exact) return exact;

  // Substring fallback: "buckhead area" → buckhead
  const candidate = rows.find(r => target.includes(normalizeLabel(r.slug)))
    ?? rows.find(r => target.includes(normalizeLabel(r.name)));
  return candidate ?? null;
}
