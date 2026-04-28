// Backfill driver_profiles for drivers onboarded via the express flow before
// the canonical-keys fix shipped. Express used to write pricing/schedule under
// keys nothing else read, so the driver's pill selections never reached the
// rider HMU page, the driver profile UI, or the booking endpoint.
//
// What this does, idempotently:
//   - For each driver whose `pricing` JSONB has any of the legacy express keys
//     (min_ride, rate_30min, rate_1hr, rate_2hr, rate_out_of_town_per_hr),
//     copy the value into the canonical key (minimum, base_rate, hourly,
//     two_hour, out_of_town) IF the canonical key is missing or zero, then
//     strip the legacy keys.
//   - For each driver whose `schedule` JSONB has the legacy `days: [...]`
//     shape, expand each short day code into `{ <fullName>: { available: true } }`
//     (only when the full-name key is missing — never overwrite a hand-edited
//     entry), then strip `days/start/end/notice_required/wait_per_min`.
//   - For each driver where advance_notice_hours is NULL or 0 AND the legacy
//     schedule had `notice_required`, parse the string to hours and set it.
//
// Usage (from project root):
//   npx tsx scripts/backfill-express-driver-config.ts          # dry run
//   npx tsx scripts/backfill-express-driver-config.ts --commit # write changes
//
// Requires: DATABASE_URL in the environment.

import { neon } from '@neondatabase/serverless';

const LEGACY_PRICING_KEYS = [
  'min_ride', 'rate_30min', 'rate_1hr', 'rate_2hr', 'rate_out_of_town_per_hr',
] as const;

const PRICING_MAP: Array<[legacy: string, canonical: string]> = [
  ['min_ride', 'minimum'],
  ['rate_30min', 'base_rate'],
  ['rate_1hr', 'hourly'],
  ['rate_2hr', 'two_hour'],
  ['rate_out_of_town_per_hr', 'out_of_town'],
];

const DAY_CODE_TO_NAME: Record<string, string> = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
  fri: 'friday', sat: 'saturday', sun: 'sunday',
};

const LEGACY_SCHEDULE_KEYS = ['days', 'start', 'end', 'notice_required', 'wait_per_min'] as const;

// advance_notice_hours is an integer column; round up to next whole hour.
// '30min' → 1, '1hr' → 1, '2hr' → 2. Returns null only on unparseable input.
function noticeHoursFromString(notice: unknown): number | null {
  if (typeof notice !== 'string') return null;
  const m = notice.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(min|hr|h|hour|hours)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return null;
  const unit = m[2] || 'min';
  const hours = unit.startsWith('h') ? n : n / 60;
  return Math.ceil(hours);
}

type Row = {
  user_id: string;
  pricing: Record<string, unknown> | null;
  schedule: Record<string, unknown> | null;
  advance_notice_hours: number | string | null;
};

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  const commit = process.argv.includes('--commit');
  const sql = neon(dbUrl);

  // Pull every driver with at least one legacy artifact in pricing or schedule.
  const rows = (await sql`
    SELECT user_id, pricing, schedule, advance_notice_hours
    FROM driver_profiles
    WHERE pricing ?| ARRAY['min_ride','rate_30min','rate_1hr','rate_2hr','rate_out_of_town_per_hr']
       OR schedule ? 'days'
       OR schedule ? 'notice_required'
  `) as unknown as Row[];

  console.log(`[backfill] ${rows.length} driver(s) with legacy pricing/schedule keys`);
  if (rows.length === 0) return;

  let pricingFixed = 0;
  let scheduleFixed = 0;
  let noticeFixed = 0;

  for (const row of rows) {
    const pricing = { ...(row.pricing ?? {}) } as Record<string, unknown>;
    const schedule = { ...(row.schedule ?? {}) } as Record<string, unknown>;

    // ─── Pricing ────────────────────────────────────────────────────────
    let pricingChanged = false;
    for (const [legacy, canonical] of PRICING_MAP) {
      const legacyVal = pricing[legacy];
      const canonicalVal = pricing[canonical];
      const canonicalMissing = canonicalVal === undefined
        || canonicalVal === null
        || Number(canonicalVal) === 0;
      if (legacyVal !== undefined && legacyVal !== null && canonicalMissing) {
        pricing[canonical] = legacyVal;
        pricingChanged = true;
      }
    }
    for (const k of LEGACY_PRICING_KEYS) {
      if (k in pricing) {
        delete pricing[k];
        pricingChanged = true;
      }
    }

    // ─── Schedule ───────────────────────────────────────────────────────
    let scheduleChanged = false;
    const legacyDays = schedule.days;
    if (Array.isArray(legacyDays)) {
      for (const code of legacyDays) {
        const name = DAY_CODE_TO_NAME[String(code).toLowerCase()];
        if (!name) continue;
        // Don't overwrite a hand-edited per-day object.
        if (!(name in schedule)) {
          schedule[name] = { available: true };
          scheduleChanged = true;
        }
      }
    }
    for (const k of LEGACY_SCHEDULE_KEYS) {
      if (k in schedule) {
        // Capture notice_required before stripping.
        if (k !== 'notice_required') {
          delete schedule[k];
          scheduleChanged = true;
        }
      }
    }

    // ─── advance_notice_hours ───────────────────────────────────────────
    let noticeUpdate: number | null = null;
    const currentNotice = Number(row.advance_notice_hours ?? 0);
    if (currentNotice <= 0 && schedule.notice_required) {
      const hours = noticeHoursFromString(schedule.notice_required);
      if (hours !== null && hours > 0) noticeUpdate = hours;
    }
    if ('notice_required' in schedule) {
      delete schedule.notice_required;
      scheduleChanged = true;
    }

    // ─── Apply ──────────────────────────────────────────────────────────
    if (pricingChanged) pricingFixed++;
    if (scheduleChanged) scheduleFixed++;
    if (noticeUpdate !== null) noticeFixed++;

    if (!commit) {
      if (pricingChanged || scheduleChanged || noticeUpdate !== null) {
        console.log(`[dry-run] ${row.user_id}`, {
          pricing: pricingChanged ? pricing : '(unchanged)',
          schedule: scheduleChanged ? schedule : '(unchanged)',
          advance_notice_hours: noticeUpdate !== null ? noticeUpdate : '(unchanged)',
        });
      }
      continue;
    }

    if (pricingChanged) {
      await sql`UPDATE driver_profiles SET pricing = ${JSON.stringify(pricing)}::jsonb WHERE user_id = ${row.user_id}`;
    }
    if (scheduleChanged) {
      await sql`UPDATE driver_profiles SET schedule = ${JSON.stringify(schedule)}::jsonb WHERE user_id = ${row.user_id}`;
    }
    if (noticeUpdate !== null) {
      await sql`UPDATE driver_profiles SET advance_notice_hours = ${noticeUpdate} WHERE user_id = ${row.user_id}`;
    }
  }

  console.log(`[backfill] ${commit ? 'committed' : 'would update'}: pricing=${pricingFixed}, schedule=${scheduleFixed}, advance_notice_hours=${noticeFixed}`);
  if (!commit) console.log('[backfill] re-run with --commit to apply.');
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
