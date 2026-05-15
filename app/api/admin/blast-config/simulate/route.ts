// POST /api/admin/blast-config/simulate — Stream E.
// V1 simulator: returns historical candidates from blast_match_log so the
// admin can see who *was* considered for an existing blast. Re-scoring with
// configOverride is a phase-8 follow-up (requires InternalMatcher to accept
// a dry-run flag). No side effects.
//
// Body: { blastId?: string, configOverride?: object }

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

  const blastId = body.blastId as string | undefined;
  if (blastId && !UUID_RE.test(blastId)) {
    return NextResponse.json({ error: 'invalid_blast_id' }, { status: 400 });
  }

  if (!blastId) {
    return NextResponse.json({
      configVersion: 0,
      providerName: 'simulator_v1',
      candidates: [],
      notifiedDriverIds: [],
      fallbackDriverIds: [],
      expandedRadius: false,
      note: 'Simulator v1 requires an existing blastId. Re-scoring with configOverride is a phase-8 follow-up.',
    });
  }

  const rows = await sql`
    SELECT id, driver_id, raw_features, normalized_features, filter_results,
           score, was_notified, config_version, provider_name, experiment_arm_id
    FROM blast_match_log
    WHERE blast_id = ${blastId}
    ORDER BY score DESC NULLS LAST
  `;

  const candidates = rows.map((r: Record<string, unknown>) => ({
    driverId: r.driver_id as string,
    rawFeatures: (r.raw_features ?? {}) as Record<string, number>,
    normalizedFeatures: (r.normalized_features ?? {}) as Record<string, number>,
    filterResults: (r.filter_results ?? []) as Array<{ filter: string; passed: boolean; value: unknown; threshold: unknown }>,
    score: r.score === null ? 0 : Number(r.score),
    scoreBreakdown: {} as Record<string, number>,
  }));

  const notifiedDriverIds = rows.filter((r: Record<string, unknown>) => r.was_notified).map((r: Record<string, unknown>) => r.driver_id as string);
  const configVersion = Number(rows[0]?.config_version ?? 0);
  const providerName = (rows[0]?.provider_name as string) ?? 'internal';

  return NextResponse.json({
    configVersion,
    providerName,
    candidates,
    notifiedDriverIds,
    fallbackDriverIds: [],
    expandedRadius: false,
    note: 'Showing historical candidates from blast_match_log. Re-scoring with configOverride is a phase-8 follow-up.',
  });
}
