// Cold-start prevention config — admin-toggleable.
//
// Neon's serverless compute scales to zero after idle; the first query after a
// suspend must wake it via the control plane, which adds latency and can
// transiently fail. Keeping the prod compute "warm" (a long suspend timeout)
// eliminates that, at the cost of always-on compute. This module is the single
// source of truth for that toggle: it persists the choice in platform_config
// and applies it to the Neon compute via the Neon API.
//
// The transport-layer retry in lib/db/client.ts is independent and always on —
// this toggle only controls whether the compute stays warm (cost vs latency).

import { getPlatformConfig, invalidatePlatformConfig } from '@/lib/platform-config/get';
import { sql } from '@/lib/db/client';

export const COLD_START_CONFIG_KEY = 'infra.cold_start';

// The warm window applied to Neon when keep_warm is ON. Presets the UI exposes.
export const WARM_PRESETS = {
  ONE_HOUR: 3_600,
  ALWAYS: 604_800, // 7 days — effectively never suspends for an active app
} as const;

// Applied when keep_warm is OFF: Neon's default 5-minute autosuspend (cold
// starts return, compute cost drops). Sending an explicit value avoids the
// ambiguity of 0 ("use project default").
export const DEFAULT_SUSPEND_SECONDS = 300;

// A `type` (not `interface`) so it satisfies getPlatformConfig's
// `T extends Record<string, unknown>` constraint.
export type ColdStartConfig = {
  /** When true, the prod compute is kept warm using suspend_timeout_seconds. */
  keep_warm: boolean;
  /** The warm window (seconds) used when keep_warm is true. */
  suspend_timeout_seconds: number;
};

const DEFAULTS: ColdStartConfig = {
  keep_warm: true,
  suspend_timeout_seconds: WARM_PRESETS.ALWAYS,
};

// Project/endpoint identifiers are not secret — only the API key is. Allow env
// overrides so this is portable across environments (e.g. a different prod
// compute), but default to the known HMU-ATL prod compute.
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const NEON_PROJECT_ID = process.env.NEON_PROJECT_ID ?? 'still-rain-53751745';
const NEON_PROD_ENDPOINT_ID = process.env.NEON_PROD_ENDPOINT_ID ?? 'ep-tiny-dew-an6h1lzy';

/** Whether the Neon API key is configured (required to actually apply changes). */
export function neonApiConfigured(): boolean {
  return !!process.env.NEON_API_KEY;
}

/** Read the current config, falling back to defaults if the row is absent. */
export async function getColdStartConfig(): Promise<ColdStartConfig> {
  const cfg = await getPlatformConfig<ColdStartConfig>(COLD_START_CONFIG_KEY, DEFAULTS);
  // Normalise: guard against a malformed stored value.
  return {
    keep_warm: cfg.keep_warm !== false,
    suspend_timeout_seconds:
      cfg.suspend_timeout_seconds === WARM_PRESETS.ONE_HOUR ? WARM_PRESETS.ONE_HOUR : WARM_PRESETS.ALWAYS,
  };
}

/** The suspend_timeout_seconds actually sent to Neon for a given config. */
export function appliedSuspendSeconds(cfg: ColdStartConfig): number {
  return cfg.keep_warm ? cfg.suspend_timeout_seconds : DEFAULT_SUSPEND_SECONDS;
}

/** Persist the config to platform_config (upsert) and bust the read cache. */
export async function saveColdStartConfig(cfg: ColdStartConfig, adminId: string): Promise<void> {
  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${COLD_START_CONFIG_KEY}, ${JSON.stringify(cfg)}::jsonb, ${adminId}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;
  invalidatePlatformConfig(COLD_START_CONFIG_KEY);
}

export interface NeonApplyResult {
  ok: boolean;
  /** The suspend_timeout_seconds Neon reports after the change (when ok). */
  appliedSeconds?: number;
  error?: string;
}

/**
 * Apply the suspend timeout to the prod Neon compute via the Neon API.
 * Never throws — returns a structured result so the caller can save the config
 * and report a clear status even when the API key is missing or Neon errors.
 */
export async function applyColdStartToNeon(seconds: number): Promise<NeonApplyResult> {
  const key = process.env.NEON_API_KEY;
  if (!key) {
    return { ok: false, error: 'NEON_API_KEY is not configured on this worker — config saved but not applied to Neon.' };
  }
  try {
    const res = await fetch(
      `${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/endpoints/${NEON_PROD_ENDPOINT_ID}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ endpoint: { suspend_timeout_seconds: seconds } }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Neon API ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { endpoint?: { suspend_timeout_seconds?: number } };
    return { ok: true, appliedSeconds: data.endpoint?.suspend_timeout_seconds };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Neon API request failed' };
  }
}
