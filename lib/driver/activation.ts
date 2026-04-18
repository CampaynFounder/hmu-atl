// Driver activation checklist — computed from driver_profiles + users state.
// 6 fields that move the needle on getting matched. Percentage = done / total * 100.

import { sql } from '@/lib/db/client';

export interface ActivationItem {
  key: string;
  label: string;
  done: boolean;
}

export interface ActivationProgress {
  items: ActivationItem[];
  complete: number;
  incomplete: number;
  total: number;
  percent: number;
}

function isNonEmptyObject(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

export async function getActivationProgress(userId: string): Promise<ActivationProgress> {
  const rows = await sql`
    SELECT thumbnail_url, video_url, pricing, schedule, vehicle_info, area_slugs
    FROM driver_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  const p = rows[0] as {
    thumbnail_url: string | null;
    video_url: string | null;
    pricing: unknown;
    schedule: unknown;
    vehicle_info: unknown;
    area_slugs: string[] | null;
  } | undefined;

  const items: ActivationItem[] = [
    { key: 'photo', label: 'Profile photo', done: !!p?.thumbnail_url },
    { key: 'video', label: 'Video intro', done: !!p?.video_url },
    { key: 'vehicle', label: 'Vehicle info', done: isNonEmptyObject(p?.vehicle_info) },
    { key: 'pricing', label: 'Pricing', done: isNonEmptyObject(p?.pricing) },
    { key: 'schedule', label: 'Schedule', done: isNonEmptyObject(p?.schedule) },
    { key: 'areas', label: 'Service areas', done: (p?.area_slugs?.length ?? 0) > 0 },
  ];

  const complete = items.filter(i => i.done).length;
  const total = items.length;
  return {
    items,
    complete,
    incomplete: total - complete,
    total,
    percent: total ? Math.round((complete / total) * 100) : 0,
  };
}

// Default pricing + schedule we apply when a driver taps "Let HMU set it up for me".
// Conservative Atlanta-wide defaults. Driver can tweak in profile edit.
export const DEFAULT_PRICING = {
  min_ride: 25,
  rate_30min: 25,
  rate_1hr: 40,
  rate_2hr: 70,
  rate_out_of_town_per_hr: 50,
  round_trip: false,
};

export const DEFAULT_SCHEDULE = {
  days: ['fri', 'sat'],
  notice_required: '30min',
};

export async function applyDefaultsIfMissing(userId: string): Promise<{ pricing: boolean; schedule: boolean }> {
  const rows = await sql`
    SELECT pricing, schedule
    FROM driver_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  const p = rows[0] as { pricing: unknown; schedule: unknown } | undefined;
  if (!p) return { pricing: false, schedule: false };

  const needsPricing = !isNonEmptyObject(p.pricing);
  const needsSchedule = !isNonEmptyObject(p.schedule);

  if (!needsPricing && !needsSchedule) return { pricing: false, schedule: false };

  await sql`
    UPDATE driver_profiles
    SET
      pricing = CASE WHEN ${needsPricing}::boolean THEN ${JSON.stringify(DEFAULT_PRICING)}::jsonb ELSE pricing END,
      schedule = CASE WHEN ${needsSchedule}::boolean THEN ${JSON.stringify(DEFAULT_SCHEDULE)}::jsonb ELSE schedule END,
      updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  return { pricing: needsPricing, schedule: needsSchedule };
}
