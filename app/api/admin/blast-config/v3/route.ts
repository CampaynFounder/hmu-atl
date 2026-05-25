// GET /api/admin/blast-config/v3?market=<slug>
// Stream E — returns the v3 blast_config row for a market (or global default
// when market is empty). Distinct from the legacy GET on the parent route
// which still reads from platform_config — both coexist per non-regression.

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.blastconfig.view')) return unauthorizedResponse();

  const url = new URL(req.url);
  const market = url.searchParams.get('market');

  // Try market-specific override first; fall back to global default.
  const rows = market
    ? await sql`SELECT * FROM blast_config WHERE market_slug = ${market} LIMIT 1`
    : await sql`SELECT * FROM blast_config WHERE market_slug IS NULL LIMIT 1`;

  let row = rows[0] as Record<string, unknown> | undefined;
  if (!row && market) {
    // Market doesn't have an override yet — return the global default so the
    // UI can show inherited values (and POST will create the market row).
    const fallbackRows = await sql`
      SELECT * FROM blast_config WHERE market_slug IS NULL LIMIT 1
    `;
    row = fallbackRows[0] as Record<string, unknown> | undefined;
  }

  if (!row) {
    // Truly no config yet — return inert defaults.
    return NextResponse.json({
      weights: {},
      hardFilters: {},
      limits: {},
      rewardFunction: 'revenue_per_blast',
      counterOfferMaxPct: 0.25,
      feedMinScorePercentile: 0,
      nlpChipOnly: false,
      configVersion: 0,
    });
  }

  return NextResponse.json({
    weights: row.weights ?? {},
    hardFilters: row.hard_filters ?? {},
    limits: row.limits ?? {},
    rewardFunction: row.reward_function ?? 'revenue_per_blast',
    counterOfferMaxPct: row.counter_offer_max_pct === null ? 0.25 : Number(row.counter_offer_max_pct),
    feedMinScorePercentile: row.feed_min_score_percentile === null ? 0 : Number(row.feed_min_score_percentile),
    nlpChipOnly: !!row.nlp_chip_only,
    configVersion: Number(row.config_version ?? 1),
  });
}
