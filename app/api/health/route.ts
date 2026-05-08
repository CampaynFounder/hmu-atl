import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { getDeployVersion } from '@/lib/deploy-version';

// Public, unauthenticated. Returns 200 when the Worker is up and the DB
// responds. Used by the staging-setup runbook and by future synthetic monitors.
// Keep cheap — single round-trip to Postgres, no app logic.
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;

  try {
    const dbStart = Date.now();
    await sql`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const body = {
    ok: dbOk,
    env: process.env.NODE_ENV || 'unknown',
    worker: process.env.CF_WORKER_NAME || null,
    version: getDeployVersion(),
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    elapsedMs: Date.now() - startedAt,
    ts: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
