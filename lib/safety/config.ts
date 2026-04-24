import { sql } from '@/lib/db/client';
import { getPlatformConfig } from '@/lib/platform-config/get';
import type {
  PlatformSafetyConfig,
  ProfileType,
  SafetyCheckParty,
  SafetyPrefs,
} from '@/lib/db/types';

const DEFAULTS: PlatformSafetyConfig = {
  enabled: true,
  default_interval_minutes_rider: 10,
  default_interval_minutes_driver: 15,
  min_interval_minutes: 5,
  max_interval_minutes: 30,
  first_check_delay_minutes: 5,
  prompt_auto_dismiss_seconds: 60,
  ignored_streak_threshold: 3,
  anomaly: {
    off_route_distance_meters: 500,
    off_route_duration_seconds: 180,
    stopped_duration_seconds: 240,
    stopped_radius_meters: 20,
    gps_silence_seconds: 90,
    wrong_direction_duration_seconds: 120,
    speed_max_mph: 85,
  },
};

export async function getPlatformSafetyConfig(): Promise<PlatformSafetyConfig> {
  const merged = await getPlatformConfig('ride_safety', DEFAULTS as unknown as Record<string, unknown>);
  const mergedCast = merged as unknown as PlatformSafetyConfig;
  // Ensure nested anomaly object has all keys even if admin blob is partial.
  return {
    ...DEFAULTS,
    ...mergedCast,
    anomaly: { ...DEFAULTS.anomaly, ...(mergedCast.anomaly ?? {}) },
  };
}

export function partyDefaultInterval(
  cfg: PlatformSafetyConfig,
  party: SafetyCheckParty,
): number {
  return party === 'rider'
    ? cfg.default_interval_minutes_rider
    : cfg.default_interval_minutes_driver;
}

export function clampInterval(cfg: PlatformSafetyConfig, minutes: number): number {
  return Math.max(cfg.min_interval_minutes, Math.min(cfg.max_interval_minutes, Math.round(minutes)));
}

/**
 * Resolve a user's safety prefs — merges DB override with platform defaults.
 * party argument picks rider vs driver default interval when user hasn't set one.
 */
export async function resolveSafetyPrefs(
  userId: string,
  profileType: ProfileType,
): Promise<SafetyPrefs> {
  const cfg = await getPlatformSafetyConfig();
  const party: SafetyCheckParty = profileType === 'driver' ? 'driver' : 'rider';

  const rows = (await sql`
    SELECT safety_checks_enabled, safety_check_interval_minutes
    FROM user_preferences
    WHERE user_id = ${userId}
    LIMIT 1
  `) as Array<{ safety_checks_enabled: boolean | null; safety_check_interval_minutes: number | null }>;

  const row = rows[0];
  const enabled = row?.safety_checks_enabled ?? true;
  const override = row?.safety_check_interval_minutes ?? null;
  const resolved = override != null ? clampInterval(cfg, override) : partyDefaultInterval(cfg, party);

  return {
    enabled: cfg.enabled ? enabled : false,
    interval_minutes: resolved,
    interval_is_default: override == null,
    min_interval_minutes: cfg.min_interval_minutes,
    max_interval_minutes: cfg.max_interval_minutes,
  };
}
