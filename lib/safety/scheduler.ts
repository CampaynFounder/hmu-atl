import { sql } from '@/lib/db/client';
import { getPlatformSafetyConfig, partyDefaultInterval, clampInterval } from '@/lib/safety/config';
import type { PlatformSafetyConfig, SafetyCheckParty } from '@/lib/db/types';

export interface RideParty {
  ride_id: string;
  user_id: string;
  party: SafetyCheckParty;
  ride_started_at: Date;
  last_prompt_sent_at: Date | null;
  prefs_enabled: boolean;
  prefs_override_minutes: number | null;
  ignored_streak: number;
}

/**
 * Pulls one row per (active_ride × party) with everything the scheduler needs
 * to decide whether a prompt is due. Only rides currently `in_progress` are
 * returned — this is the cron's working set.
 *
 * Returned interval is already resolved: user override clamped, else party default.
 */
export async function loadActiveRideParties(): Promise<RideParty[]> {
  const rows = (await sql`
    WITH active AS (
      SELECT
        r.id AS ride_id,
        r.rider_id,
        r.driver_id,
        -- rides.started_at is set when the rider confirms start (see
        -- /api/rides/[id]/confirm-start). Fall back to updated_at for any
        -- legacy rows that never got the column populated.
        COALESCE(r.started_at, r.updated_at) AS ride_started_at
      FROM rides r
      WHERE r.status = 'in_progress'
    ),
    parties AS (
      SELECT ride_id, rider_id AS user_id, 'rider'::text AS party, ride_started_at FROM active
      UNION ALL
      SELECT ride_id, driver_id AS user_id, 'driver'::text AS party, ride_started_at FROM active
    )
    SELECT
      p.ride_id,
      p.user_id,
      p.party,
      p.ride_started_at,
      (SELECT MAX(sent_at) FROM ride_safety_checks c
        WHERE c.ride_id = p.ride_id AND c.user_id = p.user_id) AS last_prompt_sent_at,
      COALESCE(up.safety_checks_enabled, TRUE) AS prefs_enabled,
      up.safety_check_interval_minutes AS prefs_override_minutes,
      (SELECT COUNT(*) FROM (
        SELECT response FROM ride_safety_checks c2
          WHERE c2.ride_id = p.ride_id AND c2.user_id = p.user_id
          ORDER BY sent_at DESC LIMIT 5
      ) recent WHERE response = 'ignored') AS ignored_streak
    FROM parties p
    LEFT JOIN user_preferences up ON up.user_id = p.user_id
  `) as Array<{
    ride_id: string;
    user_id: string;
    party: SafetyCheckParty;
    ride_started_at: string;
    last_prompt_sent_at: string | null;
    prefs_enabled: boolean;
    prefs_override_minutes: number | null;
    ignored_streak: string | number;
  }>;

  return rows.map((r) => ({
    ride_id: r.ride_id,
    user_id: r.user_id,
    party: r.party,
    ride_started_at: new Date(r.ride_started_at),
    last_prompt_sent_at: r.last_prompt_sent_at ? new Date(r.last_prompt_sent_at) : null,
    prefs_enabled: r.prefs_enabled,
    prefs_override_minutes: r.prefs_override_minutes,
    ignored_streak: Number(r.ignored_streak) || 0,
  }));
}

export interface DueDecision {
  due: boolean;
  reason: 'disabled' | 'too_soon' | 'not_started' | 'due_first' | 'due_interval';
  next_due_at: Date | null;
  interval_minutes: number;
}

/**
 * Decides whether this party should receive a check-in prompt *now*.
 * First prompt fires at ride_started_at + first_check_delay_minutes.
 * Subsequent prompts fire every interval_minutes after the previous sent_at.
 */
export function decideDue(p: RideParty, cfg: PlatformSafetyConfig, now: Date = new Date()): DueDecision {
  if (!cfg.enabled || !p.prefs_enabled) {
    return { due: false, reason: 'disabled', next_due_at: null, interval_minutes: 0 };
  }

  const interval = p.prefs_override_minutes != null
    ? clampInterval(cfg, p.prefs_override_minutes)
    : partyDefaultInterval(cfg, p.party);

  // Anchor either on last prompt sent_at (+interval) or ride start (+first delay).
  const firstDue = new Date(p.ride_started_at.getTime() + cfg.first_check_delay_minutes * 60_000);
  if (!p.last_prompt_sent_at) {
    return {
      due: now >= firstDue,
      reason: now >= firstDue ? 'due_first' : 'not_started',
      next_due_at: firstDue,
      interval_minutes: interval,
    };
  }

  const nextDue = new Date(p.last_prompt_sent_at.getTime() + interval * 60_000);
  return {
    due: now >= nextDue,
    reason: now >= nextDue ? 'due_interval' : 'too_soon',
    next_due_at: nextDue,
    interval_minutes: interval,
  };
}

export { getPlatformSafetyConfig };
