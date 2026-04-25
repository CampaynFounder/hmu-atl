// Driver activation checklist — computed from driver_profiles + users state.
// Each item has the direct route a driver should jump to in order to finish it,
// so the dashboard card can deep-link per row instead of dumping everyone into
// /driver/profile and hoping they find the right field.

import { sql } from '@/lib/db/client';

export interface ActivationItem {
  key: string;
  label: string;
  cta: string;
  route: string;
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
    SELECT
      thumbnail_url, video_url, pricing, schedule, vehicle_info, area_slugs,
      payout_setup_complete, cash_only, first_name, last_name
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
    payout_setup_complete: boolean | null;
    cash_only: boolean | null;
    first_name: string | null;
    last_name: string | null;
  } | undefined;

  // Pull license plate out of vehicle_info JSON — it lives there in both the
  // legacy and express paths so we have one place to read.
  const vi = (p?.vehicle_info as Record<string, unknown> | null) ?? null;
  const hasPlate = !!(vi && typeof vi.license_plate === 'string' && (vi.license_plate as string).trim());
  const hasGovName = !!(p?.first_name && p?.last_name);

  // Items are ordered by priority: the things most likely to get a driver
  // matched at top. Per-item route is what the dashboard card links to.
  const items: ActivationItem[] = [
    {
      key: 'photo',
      label: 'Profile photo',
      cta: 'Add photo',
      route: '/driver/profile?focus=photo',
      done: !!p?.thumbnail_url,
    },
    {
      key: 'video',
      label: 'Video intro',
      cta: 'Record video',
      route: '/driver/profile?focus=video',
      done: !!p?.video_url,
    },
    {
      key: 'pricing',
      label: 'Pricing',
      cta: 'Set pricing',
      route: '/driver/profile?focus=pricing',
      done: isNonEmptyObject(p?.pricing),
    },
    {
      key: 'schedule',
      label: 'Hours / schedule',
      cta: 'Set hours',
      route: '/driver/schedule',
      done: isNonEmptyObject(p?.schedule),
    },
    {
      key: 'areas',
      label: 'Service areas',
      cta: 'Pick areas',
      route: '/driver/profile?focus=areas',
      done: (p?.area_slugs?.length ?? 0) > 0,
    },
    {
      key: 'vehicle',
      label: 'Vehicle info',
      cta: 'Add vehicle',
      route: '/driver/profile?focus=vehicle',
      done: isNonEmptyObject(p?.vehicle_info),
    },
    {
      key: 'license_plate',
      label: 'License plate',
      cta: 'Add plate',
      route: '/driver/profile?focus=vehicle',
      done: hasPlate,
    },
    {
      key: 'gov_name',
      label: 'Verify your name',
      cta: 'Add legal name',
      route: '/driver/payout-setup',
      done: hasGovName,
    },
  ];

  // Payout counts unless the driver is cash-only. We skip the item entirely
  // for cash-only drivers so the UI doesn't nag them to connect a bank.
  const isCashOnly = !!p?.cash_only;
  if (!isCashOnly) {
    items.push({
      key: 'payout',
      label: 'Link your payout',
      cta: 'Link payout',
      route: '/driver/payout-setup',
      done: !!p?.payout_setup_complete,
    });
  }

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
