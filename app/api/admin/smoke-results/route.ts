import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';

interface CheckResult {
  name: string;
  pass: boolean;
  duration_ms: number;
  error?: string;
}

// Called by GH Actions — authenticated via shared secret, not Clerk.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-smoke-secret');
  if (!process.env.SMOKE_WEBHOOK_SECRET || secret !== process.env.SMOKE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    env, market, triggered_by, status, results,
    passed_count, failed_count, total_count, duration_ms, commit_sha,
  } = body as {
    env: string;
    market?: string;
    triggered_by: string;
    status: 'running' | 'pass' | 'fail';
    results?: CheckResult[];
    passed_count?: number;
    failed_count?: number;
    total_count?: number;
    duration_ms?: number;
    commit_sha?: string;
  };

  const rows = await sql`
    INSERT INTO smoke_test_runs
      (env, market, triggered_by, status, results, passed_count, failed_count, total_count, duration_ms, commit_sha, completed_at)
    VALUES
      (${env}, ${market ?? 'atl'}, ${triggered_by}, ${status},
       ${results ? JSON.stringify(results) : null},
       ${passed_count ?? 0}, ${failed_count ?? 0}, ${total_count ?? 0},
       ${duration_ms ?? null}, ${commit_sha ?? null},
       ${status !== 'running' ? new Date().toISOString() : null})
    RETURNING id
  `;

  const id = rows[0]?.id as string;

  if (status === 'fail' && process.env.ADMIN_ALERT_PHONE) {
    const failed = (results ?? []).filter((r) => !r.pass).map((r) => r.name);
    const preview = failed.slice(0, 3).join(', ') + (failed.length > 3 ? ` +${failed.length - 3}` : '');
    const msg = `SMOKE FAIL (${env}/${market ?? 'atl'}): ${preview} [${failed_count}/${total_count} checks]`;
    await sendSms(process.env.ADMIN_ALERT_PHONE, msg, { eventType: 'system_alert', market: 'atl' });
  }

  return NextResponse.json({ id });
}
