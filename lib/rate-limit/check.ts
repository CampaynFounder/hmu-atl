// Neon-backed rolling window rate limiter.
// Atomic UPSERT resets the counter when the existing window_start has expired,
// or increments it otherwise. Single round-trip to Postgres per check.
//
// Works correctly on Cloudflare Workers (unlike in-memory Maps, which are
// per-isolate). No external dependencies.

import { sql } from '@/lib/db/client';

export interface RateLimitResult {
  ok: boolean;
  count: number;
  limit: number;
  windowStart: Date;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

// Check and atomically increment a rate limit counter.
// Returns { ok: false } when the post-increment count exceeds the limit.
export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = opts;
  const threshold = new Date(Date.now() - windowSeconds * 1000).toISOString();

  // If the existing row's window_start is older than (now - windowSeconds),
  // treat this call as the start of a new window: count=1. Otherwise increment.
  const rows = await sql`
    INSERT INTO rate_limit_counters (key, count, window_start, updated_at)
    VALUES (${key}, 1, NOW(), NOW())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_counters.window_start < ${threshold}::timestamptz THEN 1
        ELSE rate_limit_counters.count + 1
      END,
      window_start = CASE
        WHEN rate_limit_counters.window_start < ${threshold}::timestamptz THEN NOW()
        ELSE rate_limit_counters.window_start
      END,
      updated_at = NOW()
    RETURNING count, window_start
  `;

  const row = rows[0] as { count: number; window_start: string };
  const windowStart = new Date(row.window_start);
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000)
  );

  return {
    ok: row.count <= limit,
    count: row.count,
    limit,
    windowStart,
    retryAfterSeconds,
  };
}
