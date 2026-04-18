// Feature flags — DB-backed kill-switch for in-progress features.
// Flag OFF = zero user-visible change. Check on server, pass result to client.

import { sql } from '@/lib/db/client';

export interface FeatureFlag {
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
  markets: string[] | null;
  updated_at: Date;
  updated_by: string | null;
}

export interface FlagContext {
  userId?: string;        // Neon users.id (UUID)
  marketSlug?: string;
}

// Per-request cache so repeated calls during one render don't hit the DB.
const requestCache = new Map<string, FeatureFlag | null>();

async function loadFlag(slug: string): Promise<FeatureFlag | null> {
  if (requestCache.has(slug)) return requestCache.get(slug) ?? null;
  const rows = await sql`
    SELECT slug, name, description, enabled, rollout_percentage, markets, updated_at, updated_by
    FROM feature_flags
    WHERE slug = ${slug}
    LIMIT 1
  `;
  const flag = (rows[0] as FeatureFlag | undefined) ?? null;
  requestCache.set(slug, flag);
  return flag;
}

// Deterministic 0-99 bucket from user id. Same user always gets the same bucket.
function bucketForUser(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = ((h << 5) - h + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

export async function isFeatureEnabled(slug: string, ctx: FlagContext = {}): Promise<boolean> {
  const flag = await loadFlag(slug);
  if (!flag || !flag.enabled) return false;

  if (flag.markets && flag.markets.length > 0) {
    if (!ctx.marketSlug || !flag.markets.includes(ctx.marketSlug)) return false;
  }

  if (flag.rollout_percentage >= 100) return true;
  if (flag.rollout_percentage <= 0) return false;

  if (!ctx.userId) return flag.rollout_percentage >= 100;
  return bucketForUser(ctx.userId) < flag.rollout_percentage;
}

export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  const rows = await sql`
    SELECT slug, name, description, enabled, rollout_percentage, markets, updated_at, updated_by
    FROM feature_flags
    ORDER BY slug
  `;
  return rows as FeatureFlag[];
}

export interface FlagUpdate {
  enabled: boolean;
  rollout_percentage: number;
  markets: string[] | null;
}

export async function updateFeatureFlag(
  slug: string,
  update: FlagUpdate,
  updatedBy: string | null,
): Promise<FeatureFlag> {
  requestCache.delete(slug);
  const rows = await sql`
    UPDATE feature_flags
    SET
      enabled = ${update.enabled},
      rollout_percentage = ${update.rollout_percentage},
      markets = ${update.markets}::text[],
      updated_at = NOW(),
      updated_by = ${updatedBy}
    WHERE slug = ${slug}
    RETURNING slug, name, description, enabled, rollout_percentage, markets, updated_at, updated_by
  `;
  if (!rows[0]) throw new Error(`feature flag ${slug} not found`);
  return rows[0] as FeatureFlag;
}
