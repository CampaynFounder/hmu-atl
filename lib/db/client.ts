// Neon Database Client
// Used by all agents for database access

import { neon, neonConfig, Pool } from '@neondatabase/serverless';

// Configure Neon for serverless environments
neonConfig.fetchConnectionCache = true;

// ---------------------------------------------------------------------------
// Cold-start resilience
// ---------------------------------------------------------------------------
// Neon's serverless compute scales to zero after an idle window (5 min by
// default). The first query after a suspend must wake the compute via Neon's
// control plane, and that wake can transiently fail — surfacing as an HTTP 520
// (Cloudflare "unknown error from origin") or a 500 whose body carries
// {"neon:retryable": true, "message": "Control plane request failed"}.
//
// These failures all mean the query NEVER reached Postgres (the compute wasn't
// up yet), so retrying is safe — there is no risk of double-applying a write.
// We retry at the transport layer (neonConfig.fetchFunction) so EVERY query
// goes through it without changing the `sql` tag interface that ~440 call sites
// depend on.
//
// We deliberately do NOT retry ordinary query errors (e.g. a 400 for a bad
// SQL statement or a missing column) — those are deterministic and would just
// waste time. Only pre-execution gateway/control-plane failures are retried.
const RETRYABLE_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524]);
const MAX_ATTEMPTS = 4;

function backoffMs(attempt: number): number {
  // 300ms, 700ms, 1500ms — a cold wake typically completes within ~1–3s.
  return 300 * 2 ** attempt + 100;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const baseFetch: typeof fetch = globalThis.fetch.bind(globalThis);

async function fetchWithColdStartRetry(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS - 1;
    try {
      const res = await baseFetch(input, init);
      if (res.ok || isLast) return res;

      // Edge/gateway error → request never executed; safe to retry.
      if (RETRYABLE_STATUS.has(res.status)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      // A 500 may wrap Neon's retryable control-plane error in its body.
      if (res.status === 500) {
        const body = await res.clone().text().catch(() => '');
        if (body.includes('neon:retryable') || body.includes('Control plane request failed')) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
      return res; // deterministic error — hand back untouched
    } catch (err) {
      // Network-level failure (e.g. the wake timed out before a response).
      // For Neon HTTP this is overwhelmingly a pre-execution cold-start failure.
      lastErr = err;
      if (isLast) throw err;
      await sleep(backoffMs(attempt));
    }
  }
  throw lastErr;
}

neonConfig.fetchFunction = fetchWithColdStartRetry;

// Pooled connection for serverless functions (recommended for most queries)
// Only initialize if DATABASE_URL is available (skip during build time)
export const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : (() => { throw new Error('DATABASE_URL not configured'); }) as any;

// Direct connection pool for transactions and complex queries
export const pool = process.env.DATABASE_URL_UNPOOLED
  ? new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED })
  : null as any;

// Note: For parameterized queries, use the sql template tag directly:
// const result = await sql`SELECT * FROM users WHERE id = ${userId}`;
// This helper is kept for backwards compatibility but may be removed in future

// Helper: Execute within a transaction
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
