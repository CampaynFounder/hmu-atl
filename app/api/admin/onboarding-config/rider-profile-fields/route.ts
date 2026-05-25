// GET/PATCH /api/admin/onboarding-config/rider-profile-fields — admin-tunable
// rider profile-fields config (ride types + home area). Stored in
// platform_config under 'onboarding.rider_profile_fields'.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import {
  RIDER_PROFILE_FIELDS_DEFAULTS,
  type RiderProfileFieldsConfig,
  type RideTypeOption,
} from '@/lib/onboarding/rider-profile-fields-config';
import type { FieldVisibility } from '@/lib/onboarding/config';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const KEY = 'onboarding.rider_profile_fields';
const VISIBILITY: FieldVisibility[] = ['required', 'optional', 'hidden', 'deferred'];
const FIELD_KEYS: (keyof RiderProfileFieldsConfig['fields'])[] = ['rideTypes', 'homeArea'];
const SLUG_RE = /^[a-z0-9_]{1,32}$/;
const MAX_OPTIONS = 24;
const MAX_LABEL = 32;
const MAX_EMOJI = 8;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.onboarding.view')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_value, updated_at, updated_by
    FROM platform_config
    WHERE config_key = ${KEY}
    LIMIT 1
  `;
  const stored = rows[0]?.config_value ?? null;
  // Deep-merge fields so admin GET returns every key even if stored row
  // predates a new field. Same shape as the public endpoint expects.
  const config: RiderProfileFieldsConfig = stored
    ? {
        ...RIDER_PROFILE_FIELDS_DEFAULTS,
        ...stored,
        fields: { ...RIDER_PROFILE_FIELDS_DEFAULTS.fields, ...(stored.fields ?? {}) },
        rideTypeOptions: Array.isArray(stored.rideTypeOptions) && stored.rideTypeOptions.length
          ? stored.rideTypeOptions
          : RIDER_PROFILE_FIELDS_DEFAULTS.rideTypeOptions,
        maxRideTypeSelections: typeof stored.maxRideTypeSelections === 'number'
          ? stored.maxRideTypeSelections
          : RIDER_PROFILE_FIELDS_DEFAULTS.maxRideTypeSelections,
      }
    : RIDER_PROFILE_FIELDS_DEFAULTS;

  return NextResponse.json({
    config,
    updated_at: rows[0]?.updated_at ?? null,
    updated_by: rows[0]?.updated_by ?? null,
    defaults: RIDER_PROFILE_FIELDS_DEFAULTS,
  });
}

function validate(body: unknown): { ok: true; value: RiderProfileFieldsConfig } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Partial<RiderProfileFieldsConfig>;

  const fields = b.fields as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== 'object') return { ok: false, error: 'fields missing' };
  for (const k of FIELD_KEYS) {
    const v = fields[k as string];
    if (typeof v !== 'string' || !VISIBILITY.includes(v as FieldVisibility)) {
      return { ok: false, error: `fields.${k} must be one of ${VISIBILITY.join(', ')}` };
    }
  }

  if (!Array.isArray(b.rideTypeOptions)) return { ok: false, error: 'rideTypeOptions must be an array' };
  if (b.rideTypeOptions.length === 0) return { ok: false, error: 'rideTypeOptions cannot be empty' };
  if (b.rideTypeOptions.length > MAX_OPTIONS) return { ok: false, error: `rideTypeOptions capped at ${MAX_OPTIONS}` };

  const seenSlugs = new Set<string>();
  const cleanedOptions: RideTypeOption[] = [];
  for (const raw of b.rideTypeOptions) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'each rideTypeOption must be an object' };
    const o = raw as Partial<RideTypeOption>;
    if (typeof o.slug !== 'string' || !SLUG_RE.test(o.slug)) {
      return { ok: false, error: `rideTypeOption.slug "${o.slug}" must match ${SLUG_RE}` };
    }
    if (seenSlugs.has(o.slug)) return { ok: false, error: `duplicate rideTypeOption slug "${o.slug}"` };
    seenSlugs.add(o.slug);
    if (typeof o.label !== 'string' || o.label.trim().length === 0) {
      return { ok: false, error: `rideTypeOption "${o.slug}" must have a non-empty label` };
    }
    if (o.label.length > MAX_LABEL) return { ok: false, error: `label "${o.label}" exceeds ${MAX_LABEL} chars` };
    if (o.emoji !== undefined && o.emoji !== null) {
      if (typeof o.emoji !== 'string') return { ok: false, error: `emoji must be a string` };
      if (o.emoji.length > MAX_EMOJI) return { ok: false, error: `emoji "${o.emoji}" too long` };
    }
    cleanedOptions.push({
      slug: o.slug,
      label: o.label.trim(),
      emoji: o.emoji?.trim() || undefined,
      enabled: o.enabled !== false,
    });
  }

  const max = b.maxRideTypeSelections;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > cleanedOptions.length) {
    return { ok: false, error: `maxRideTypeSelections must be an integer between 1 and ${cleanedOptions.length}` };
  }

  return {
    ok: true,
    value: {
      fields: fields as unknown as RiderProfileFieldsConfig['fields'],
      rideTypeOptions: cleanedOptions,
      maxRideTypeSelections: max,
    },
  };
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.onboarding.edit')) return unauthorizedResponse();

  const raw = await req.json().catch(() => null);
  const result = validate(raw);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const json = JSON.stringify(result.value);
  const updated = await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${KEY}, ${json}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_key, config_value, updated_at
  `;

  invalidatePlatformConfig(KEY);
  await logAdminAction(
    admin.id,
    'onboarding_config_rider_profile_fields_update',
    'platform_config',
    KEY,
    { newValue: result.value },
  );
  return NextResponse.json({ row: updated[0] });
}
