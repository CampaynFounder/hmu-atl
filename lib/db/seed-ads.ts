// Seed advertisements — admin-managed promo cards injected into the native
// browse feeds. See migration 2026-08-01-seed-data-and-comment-crud.sql.

import { sql } from './client';

export type AdSurface = 'rider_browse' | 'driver_browse' | 'both';

export interface SeedAd {
  id: string;
  surface: AdSurface;
  market_id: string | null;
  market_slug?: string | null;
  headline: string;
  body: string | null;
  cta_label: string | null;
  cta_url: string | null;
  media_url: string | null;
  poster_url: string | null;
  media_type: 'photo' | 'video' | null;
  frequency: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface UpsertSeedAdParams {
  surface: AdSurface;
  market_id?: string | null;
  headline: string;
  body?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  media_url?: string | null;
  poster_url?: string | null;
  media_type?: 'photo' | 'video' | null;
  frequency?: number;
  sort_order?: number;
  is_active?: boolean;
}

export async function listSeedAds(): Promise<SeedAd[]> {
  const rows = await sql`
    SELECT a.*, m.slug AS market_slug
    FROM seed_advertisements a
    LEFT JOIN markets m ON m.id = a.market_id
    ORDER BY a.sort_order ASC, a.created_at DESC
  `;
  return rows as SeedAd[];
}

export async function createSeedAd(params: UpsertSeedAdParams, createdBy: string): Promise<SeedAd> {
  const rows = await sql`
    INSERT INTO seed_advertisements (
      surface, market_id, headline, body, cta_label, cta_url,
      media_url, poster_url, media_type, frequency, sort_order, is_active, created_by
    ) VALUES (
      ${params.surface}, ${params.market_id ?? null}, ${params.headline},
      ${params.body ?? null}, ${params.cta_label ?? null}, ${params.cta_url ?? null},
      ${params.media_url ?? null}, ${params.poster_url ?? null}, ${params.media_type ?? null},
      ${params.frequency ?? 6}, ${params.sort_order ?? 0}, ${params.is_active ?? true}, ${createdBy}
    )
    RETURNING *
  `;
  return rows[0] as SeedAd;
}

export async function updateSeedAd(id: string, params: Partial<UpsertSeedAdParams>): Promise<SeedAd | null> {
  const rows = await sql`
    UPDATE seed_advertisements SET
      surface     = COALESCE(${params.surface ?? null}, surface),
      market_id   = ${params.market_id === undefined ? sql`market_id` : (params.market_id ?? null)},
      headline    = COALESCE(${params.headline ?? null}, headline),
      body        = ${params.body === undefined ? sql`body` : (params.body ?? null)},
      cta_label   = ${params.cta_label === undefined ? sql`cta_label` : (params.cta_label ?? null)},
      cta_url     = ${params.cta_url === undefined ? sql`cta_url` : (params.cta_url ?? null)},
      media_url   = ${params.media_url === undefined ? sql`media_url` : (params.media_url ?? null)},
      poster_url  = ${params.poster_url === undefined ? sql`poster_url` : (params.poster_url ?? null)},
      media_type  = ${params.media_type === undefined ? sql`media_type` : (params.media_type ?? null)},
      frequency   = COALESCE(${params.frequency ?? null}, frequency),
      sort_order  = COALESCE(${params.sort_order ?? null}, sort_order),
      is_active   = COALESCE(${params.is_active ?? null}, is_active),
      updated_at  = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as SeedAd) || null;
}

export async function deleteSeedAd(id: string): Promise<{ media_url: string | null; poster_url: string | null } | null> {
  const rows = await sql`
    DELETE FROM seed_advertisements WHERE id = ${id}
    RETURNING media_url, poster_url
  `;
  return (rows[0] as { media_url: string | null; poster_url: string | null }) || null;
}

/**
 * Active ads for a browse surface, scoped to `marketId` plus global (NULL)
 * ads. Anonymous callers (null marketId) get only global ads.
 */
export async function getAdsForFeed(
  surface: 'rider_browse' | 'driver_browse',
  marketId: string | null,
): Promise<SeedAd[]> {
  const rows = await sql`
    SELECT id, surface, market_id, headline, body, cta_label, cta_url,
           media_url, poster_url, media_type, frequency, sort_order, is_active, created_at
    FROM seed_advertisements
    WHERE is_active = true
      AND (surface = ${surface} OR surface = 'both')
      AND (market_id IS NULL OR market_id = ${marketId})
    ORDER BY sort_order ASC, created_at DESC
  `;
  return rows as SeedAd[];
}
