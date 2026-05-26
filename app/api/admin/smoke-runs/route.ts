import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = new URL(req.url);
  const env = searchParams.get('env') ?? 'staging';
  const market = searchParams.get('market');

  const runs = market
    ? await sql`
        SELECT id, env, market, triggered_by, status, results,
               passed_count, failed_count, total_count, duration_ms,
               commit_sha, created_at, completed_at
        FROM smoke_test_runs
        WHERE env = ${env} AND market = ${market}
        ORDER BY created_at DESC
        LIMIT 10
      `
    : await sql`
        SELECT id, env, market, triggered_by, status, results,
               passed_count, failed_count, total_count, duration_ms,
               commit_sha, created_at, completed_at
        FROM smoke_test_runs
        WHERE env = ${env}
        ORDER BY created_at DESC
        LIMIT 10
      `;

  return NextResponse.json({ runs });
}
