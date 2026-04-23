// HMU/Link feature helpers — read tunable config, compute ET calendar-day keys,
// issue rate-limited HMU sends. See memory/hmu_link_feature_phase1.md for spec.

import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';

export interface HmuConfig {
  capFreeDaily: number | null;
  capHmuFirstDaily: number | null;
  capResetMode: 'calendar_day_et' | 'rolling_24h';
  expiryHours: number;
  riderLinkThrottlePerDay: number | null;
}

// Single round-trip read of all hmu.* platform_config rows.
export async function readHmuConfig(): Promise<HmuConfig> {
  const rows = await sql`
    SELECT config_key, config_value FROM platform_config WHERE config_key LIKE 'hmu.%'
  `;
  const byKey = Object.fromEntries(
    rows.map((r: Record<string, unknown>) => [r.config_key as string, r.config_value as Record<string, unknown>])
  );
  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);
  return {
    capFreeDaily: num(byKey['hmu.cap_free_daily']?.value),
    capHmuFirstDaily: num(byKey['hmu.cap_hmu_first_daily']?.value),
    capResetMode: (byKey['hmu.cap_reset_mode']?.mode as 'calendar_day_et' | 'rolling_24h') || 'calendar_day_et',
    expiryHours: Number(byKey['hmu.expiry_hours']?.value ?? 24),
    riderLinkThrottlePerDay: num(byKey['hmu.rider_link_throttle_per_day']?.value),
  };
}

// YYYY-MM-DD in America/New_York — the only mode Phase 1 implements.
// `rolling_24h` branch will live here when enabled.
export function etCalendarDate(d: Date = new Date()): string {
  // en-CA yields YYYY-MM-DD; TZ forces ET regardless of server locale.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Daily-cap rate-limit key. `windowSeconds: 86400` keeps checkRateLimit happy,
// but the date in the key is what enforces true ET-day reset — the counter simply
// starts fresh when the date string flips at midnight ET.
export function hmuCapKey(driverId: string): string {
  return `hmu:send:${driverId}:${etCalendarDate()}`;
}

export interface HmuSendResult {
  ok: boolean;
  reason?: 'cap_exceeded' | 'blocked' | 'self' | 'rider_not_active' | 'driver_not_active';
  count?: number;
  limit?: number | null;
  hmuId?: string;
}

// Send or refresh an HMU from driver → rider. Idempotent via UNIQUE(driver_id, rider_id):
// a resend resets status, expires_at, and created_at on the existing row.
export async function sendHmu(params: {
  driverId: string;
  driverTier: 'free' | 'hmu_first';
  driverMarketId: string | null;
  riderId: string;
  message?: string | null;
}): Promise<HmuSendResult> {
  if (params.driverId === params.riderId) return { ok: false, reason: 'self' };

  // Check rider isn't blocking this driver (dismiss from a prior HMU)
  const blocked = await sql`
    SELECT 1 FROM blocked_users
    WHERE blocker_id = ${params.riderId} AND blocked_id = ${params.driverId}
    LIMIT 1
  `;
  if (blocked.length) return { ok: false, reason: 'blocked' };

  // Confirm both parties are active
  const actives = await sql`
    SELECT id, account_status FROM users WHERE id IN (${params.driverId}, ${params.riderId})
  `;
  const riderActive = actives.some((r: Record<string, unknown>) => r.id === params.riderId && r.account_status === 'active');
  const driverActive = actives.some((r: Record<string, unknown>) => r.id === params.driverId && r.account_status === 'active');
  if (!driverActive) return { ok: false, reason: 'driver_not_active' };
  if (!riderActive) return { ok: false, reason: 'rider_not_active' };

  // Cap check — only if cap is set (null = unlimited)
  const config = await readHmuConfig();
  const limit = params.driverTier === 'hmu_first' ? config.capHmuFirstDaily : config.capFreeDaily;
  if (limit !== null) {
    const rate = await checkRateLimit({
      key: hmuCapKey(params.driverId),
      limit,
      windowSeconds: 86_400,
    });
    if (!rate.ok) {
      return { ok: false, reason: 'cap_exceeded', count: rate.count, limit };
    }
  }

  // UPSERT — resend updates existing row, preserving audit lineage.
  const expiresAt = new Date(Date.now() + config.expiryHours * 3_600_000).toISOString();
  const inserted = await sql`
    INSERT INTO driver_to_rider_hmus (driver_id, rider_id, market_id, status, message, expires_at)
    VALUES (${params.driverId}, ${params.riderId}, ${params.driverMarketId}, 'active', ${params.message ?? null}, ${expiresAt})
    ON CONFLICT (driver_id, rider_id) DO UPDATE SET
      status = 'active',
      message = EXCLUDED.message,
      expires_at = EXCLUDED.expires_at,
      linked_at = NULL,
      dismissed_at = NULL,
      unlinked_at = NULL,
      created_at = NOW()
    RETURNING id
  `;

  return { ok: true, hmuId: inserted[0].id as string };
}
