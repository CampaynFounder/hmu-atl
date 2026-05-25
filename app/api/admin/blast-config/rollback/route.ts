// POST /api/admin/blast-config/rollback — Stream E.
// Body: { auditId: string, reason?: string }
// Loads the audit snapshot and applies it as a new save (creating yet another
// audit row so the rollback itself is reversible).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.blastconfig.edit')) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const auditId = body.auditId as string;
  const reason = (body.reason as string | undefined) ?? 'rollback';
  if (!auditId || !UUID_RE.test(auditId)) {
    return NextResponse.json({ error: 'invalid_audit_id' }, { status: 400 });
  }

  const rows = await sql`
    SELECT market_slug, config_snapshot
    FROM blast_config_audit
    WHERE id = ${auditId}
    LIMIT 1
  `;
  const audit = rows[0] as { market_slug: string | null; config_snapshot: Record<string, unknown> } | undefined;
  if (!audit) return NextResponse.json({ error: 'audit_not_found' }, { status: 404 });

  const s = audit.config_snapshot;
  const upserted = await sql`
    INSERT INTO blast_config (
      market_slug, weights, hard_filters, limits,
      reward_function, counter_offer_max_pct, feed_min_score_percentile,
      nlp_chip_only, config_version, updated_by, updated_at
    ) VALUES (
      ${audit.market_slug},
      ${JSON.stringify(s.weights ?? {})}::jsonb,
      ${JSON.stringify(s.hard_filters ?? {})}::jsonb,
      ${JSON.stringify(s.limits ?? {})}::jsonb,
      ${(s.reward_function as string) ?? 'revenue_per_blast'},
      ${Number(s.counter_offer_max_pct ?? 0.25)},
      ${Math.round(Number(s.feed_min_score_percentile ?? 0))},
      ${!!s.nlp_chip_only},
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
    RETURNING config_version
  `;
  const newVersion = (upserted[0] as { config_version: number }).config_version;

  // Audit the rollback action itself.
  await sql`
    INSERT INTO blast_config_audit (market_slug, config_snapshot, changed_by, reason)
    VALUES (${audit.market_slug}, ${JSON.stringify({ ...s, rolled_back_from: auditId })}::jsonb, ${admin.id}, ${reason})
  `;

  return NextResponse.json({ configVersion: newVersion, rolledBackFrom: auditId });
}
