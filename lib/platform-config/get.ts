import { sql } from '@/lib/db/client';

// In-memory cache with short TTL. Cloudflare Worker isolates are short-lived
// and cache warms per isolate, so TTL primarily serves long-running dev servers.
const TTL_MS = 60_000;

type CacheEntry = { value: unknown; expires: number };
const cache = new Map<string, CacheEntry>();

/**
 * Fetch a platform_config row, merged with supplied defaults.
 * Missing rows silently fall back to defaults (does not write).
 * Defaults are merged shallowly — pass nested defaults for nested JSON.
 */
export async function getPlatformConfig<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return { ...defaults, ...(hit.value as Partial<T>) };
  }

  let stored: Partial<T> = {};
  try {
    const rows = (await sql`
      SELECT config_value FROM platform_config WHERE config_key = ${key} LIMIT 1
    `) as Array<{ config_value: Partial<T> }>;
    stored = rows[0]?.config_value ?? {};
  } catch (err) {
    console.error(`platform_config read failed for ${key}:`, err);
    return defaults;
  }

  cache.set(key, { value: stored, expires: Date.now() + TTL_MS });
  return { ...defaults, ...stored };
}

/** Test/admin-tool helper — forces next read to go to DB. */
export function invalidatePlatformConfig(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
