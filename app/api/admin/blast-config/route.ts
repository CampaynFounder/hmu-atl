// GET/PATCH /api/admin/blast-config — admin-tunable blast booking config rows.
// Surfaces `blast_matching_v1` (the matching algorithm JSON) and all `blast.*`
// knobs (sms kill switch, rate limits, draft TTL).
//
// PATCH body: { config_key: string, config_value: object }
// Mirrors the hmu-config pattern.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const ALLOWED_KEYS_PREFIX = 'blast.';
const ALLOWED_EXACT_KEYS = new Set(['blast_matching_v1']);

function isAllowedKey(key: string): boolean {
  return key.startsWith(ALLOWED_KEYS_PREFIX) || ALLOWED_EXACT_KEYS.has(key);
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.blastconfig.view')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_key, config_value, updated_at
    FROM platform_config
    WHERE config_key = 'blast_matching_v1' OR config_key LIKE 'blast.%'
    ORDER BY
      CASE WHEN config_key = 'blast_matching_v1' THEN 0 ELSE 1 END,
      config_key
  `;
  return NextResponse.json({ rows });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.blastconfig.edit')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    config_key?: string;
    config_value?: unknown;
  };
  const key = body.config_key;
  const value = body.config_value;

  if (!key || !isAllowedKey(key)) {
    return NextResponse.json(
      { error: "config_key must be 'blast_matching_v1' or start with 'blast.'" },
      { status: 400 },
    );
  }
  if (value === undefined || value === null || typeof value !== 'object') {
    return NextResponse.json({ error: 'config_value must be a JSON object' }, { status: 400 });
  }

  const jsonValue = JSON.stringify(value);
  const updated = await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${key}, ${jsonValue}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_key, config_value, updated_at
  `;

  invalidatePlatformConfig(key);
  await logAdminAction(admin.id, 'blast_config_update', 'platform_config', key, { newValue: value });
  return NextResponse.json({ row: updated[0] });
}

// POST — v3 no-code config writes (Stream E will implement).
// Per contract §8: body = Partial<BlastConfig> & { marketSlug?, reason? }
// Returns { configVersion, auditId }. Writes to the new `blast_config` table
// (Gate 2.1 schema) — NOT to platform_config like the legacy PATCH above.
// Both endpoints coexist during the v2→v3 migration window per non-regression
// rule §11.4 (UI replacements feature-flagged or shadow-deployed).
// Stream E — POST /api/admin/blast-config writes to the v3 `blast_config`
// table (per-market overrides) AND appends an audit row. Distinct from the
// PATCH above which still writes to the v2 `platform_config` table.
//
// Body shape: { market_slug?: string|null, weights, hard_filters, limits,
//   reward_function, counter_offer_max_pct, feed_min_score_percentile,
//   nlp_chip_only, reason? }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.blastconfig.edit')) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const marketSlug = (body.market_slug as string | null | undefined) ?? null;
  const weights = (body.weights as Record<string, number>) ?? {};
  const hardFilters = (body.hard_filters as Record<string, unknown>) ?? {};
  const limits = (body.limits as Record<string, number | boolean>) ?? {};
  const rewardFunction = (body.reward_function as string) ?? 'revenue_per_blast';
  const counterOfferMaxPct = Number(body.counter_offer_max_pct ?? 0.25);
  const feedMinScorePercentile = Math.round(Number(body.feed_min_score_percentile ?? 0));
  const nlpChipOnly = !!body.nlp_chip_only;
  const reason = (body.reason as string | null) ?? null;

  // UPSERT — increment config_version on every save.
  const upserted = await sql`
    INSERT INTO blast_config (
      market_slug, weights, hard_filters, limits,
      reward_function, counter_offer_max_pct, feed_min_score_percentile,
      nlp_chip_only, config_version, updated_by, updated_at
    ) VALUES (
      ${marketSlug},
      ${JSON.stringify(weights)}::jsonb,
      ${JSON.stringify(hardFilters)}::jsonb,
      ${JSON.stringify(limits)}::jsonb,
      ${rewardFunction},
      ${counterOfferMaxPct},
      ${feedMinScorePercentile},
      ${nlpChipOnly},
      1,
      ${admin.id},
      NOW()
    )
    ON CONFLICT (market_slug) DO UPDATE SET
      weights = EXCLUDED.weights,
      hard_filters = EXCLUDED.hard_filters,
      limits = EXCLUDED.limits,
      reward_function = EXCLUDED.reward_function,
      counter_offer_max_pct = EXCLUDED.counter_offer_max_pct,
      feed_min_score_percentile = EXCLUDED.feed_min_score_percentile,
      nlp_chip_only = EXCLUDED.nlp_chip_only,
      config_version = blast_config.config_version + 1,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING id, config_version
  `;
  const newRow = upserted[0] as { id: string; config_version: number };

  // Append audit row.
  const snapshot = {
    weights, hard_filters: hardFilters, limits,
    reward_function: rewardFunction, counter_offer_max_pct: counterOfferMaxPct,
    feed_min_score_percentile: feedMinScorePercentile, nlp_chip_only: nlpChipOnly,
    config_version: newRow.config_version,
  };
  const audit = await sql`
    INSERT INTO blast_config_audit (market_slug, config_snapshot, changed_by, reason)
    VALUES (${marketSlug}, ${JSON.stringify(snapshot)}::jsonb, ${admin.id}, ${reason})
    RETURNING id
  `;

  return NextResponse.json({
    configVersion: newRow.config_version,
    auditId: (audit[0] as { id: string }).id,
  });
}
