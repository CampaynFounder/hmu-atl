// Tier Card Resolver — server-side
//
// Enriches `tier_free` and `tier_hmu_first` zones with strikethrough pricing
// and offer-label fields based on the currently active `public_offers` rows
// for the given (market, tier, funnel_stage). Never throws — on any error or
// missing data, the content map is returned unchanged so the tier cards fall
// back to whatever the CMS variant / default / hardcoded fallback provided.

import { sql } from '@/lib/db/client';
import type { ContentMap } from './types';

// 60-second in-memory cache, keyed by market+stage. Mirrors the pattern in
// lib/payments/fee-calculator.ts so tier card reads stay cheap on warm paths.
interface OfferCacheEntry {
  rows: Array<{
    tier: 'free' | 'hmu_first';
    before_cents: number;
    after_cents: number;
    label: string | null;
    stage: string | null;
  }>;
  fetchedAt: number;
}
const offerCache = new Map<string, OfferCacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(marketSlug: string): string {
  return marketSlug;
}

function formatPriceCents(cents: number): string {
  if (cents === 0) return 'FREE';
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

async function loadActiveOffers(marketSlug: string): Promise<OfferCacheEntry['rows']> {
  const key = cacheKey(marketSlug);
  const hit = offerCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.rows;
  }

  try {
    // Include both market-scoped offers (if a market exists with this slug) and
    // market-agnostic offers (market_id IS NULL) — market-scoped wins later if
    // both apply to the same (tier, stage) cell.
    const rows = await sql`
      SELECT
        po.tier,
        po.before_price_cents,
        po.after_price_cents,
        po.label_text,
        po.funnel_stage_slug,
        po.market_id
      FROM public_offers po
      LEFT JOIN markets m ON m.id = po.market_id
      WHERE po.is_active = TRUE
        AND (po.effective_to IS NULL OR po.effective_to > NOW())
        AND (po.market_id IS NULL OR m.slug = ${marketSlug})
    `;

    const normalized = rows.map((r: Record<string, unknown>) => ({
      tier: r.tier as 'free' | 'hmu_first',
      before_cents: Number(r.before_price_cents),
      after_cents: Number(r.after_price_cents),
      label: (r.label_text as string | null) ?? null,
      stage: (r.funnel_stage_slug as string | null) ?? null,
      market_id: r.market_id as string | null,
    }));

    // If the same (tier, stage) has both a market-scoped and market-null row,
    // prefer the market-scoped one.
    const bestByKey = new Map<string, typeof normalized[number]>();
    for (const row of normalized) {
      const k = `${row.tier}:${row.stage ?? 'ALL'}`;
      const existing = bestByKey.get(k);
      if (!existing) { bestByKey.set(k, row); continue; }
      // Prefer rows with a market_id over null ones.
      if (row.market_id && !existing.market_id) bestByKey.set(k, row);
    }

    const deduped = Array.from(bestByKey.values()).map(({ market_id: _ignore, ...rest }) => rest);
    offerCache.set(key, { rows: deduped, fetchedAt: Date.now() });
    return deduped;
  } catch (err) {
    console.warn('[tier-card-resolver] Failed to load public offers, skipping enrichment:', err);
    return [];
  }
}

function pickOfferForTier(
  offers: OfferCacheEntry['rows'],
  tier: 'free' | 'hmu_first',
  funnelStage: string,
): OfferCacheEntry['rows'][number] | null {
  const stageMatch = offers.find((o) => o.tier === tier && o.stage === funnelStage);
  if (stageMatch) return stageMatch;
  const stageAny = offers.find((o) => o.tier === tier && o.stage === null);
  if (stageAny) return stageAny;
  return null;
}

interface TierCardExtras {
  strikethroughBefore: string | null;
  strikethroughAfter: string | null;
  offerLabel: string | null;
}

function enrichTierZone(zoneContent: unknown, extras: TierCardExtras): unknown {
  // Only enrich object-shaped zone content. String/array zones pass through.
  if (!zoneContent || typeof zoneContent !== 'object' || Array.isArray(zoneContent)) {
    return zoneContent;
  }
  const base = zoneContent as Record<string, unknown>;
  return {
    ...base,
    strikethroughBefore: extras.strikethroughBefore,
    strikethroughAfter: extras.strikethroughAfter,
    offerLabel: extras.offerLabel,
  };
}

/**
 * Mutates-by-returning a new ContentMap with `tier_free` and `tier_hmu_first`
 * enriched with strikethrough/label fields. No-op for other zones. No-op if
 * no active offer applies.
 */
export async function resolveTierCardExtras(
  content: ContentMap,
  marketSlug: string,
  funnelStage: string,
): Promise<ContentMap> {
  try {
    const offers = await loadActiveOffers(marketSlug);
    if (offers.length === 0) return content;

    const result: ContentMap = { ...content };

    for (const tier of ['free', 'hmu_first'] as const) {
      const zoneKey = tier === 'free' ? 'tier_free' : 'tier_hmu_first';
      const match = pickOfferForTier(offers, tier, funnelStage);
      if (!match) continue;

      const extras: TierCardExtras = {
        strikethroughBefore: formatPriceCents(match.before_cents),
        strikethroughAfter: formatPriceCents(match.after_cents),
        offerLabel: match.label,
      };
      result[zoneKey] = enrichTierZone(result[zoneKey], extras);
    }

    return result;
  } catch (err) {
    console.warn('[tier-card-resolver] Enrichment failed, using content unchanged:', err);
    return content;
  }
}

/**
 * Testing / admin preview: clear the in-memory cache so the next call re-reads
 * from Neon. Used after an admin save so the preview tab refreshes.
 */
export function clearTierCardCache(): void {
  offerCache.clear();
}
