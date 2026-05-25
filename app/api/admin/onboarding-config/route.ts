// GET/PATCH /api/admin/onboarding-config — admin-tunable driver express
// onboarding settings. Stored in platform_config under
// 'onboarding.driver_express'. PATCH replaces the entire config_value
// JSON; client sends the validated DriverExpressConfig shape.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import {
  DRIVER_EXPRESS_DEFAULTS,
  type DriverExpressConfig,
  type FieldVisibility,
} from '@/lib/onboarding/config';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const KEY = 'onboarding.driver_express';
const VISIBILITY: FieldVisibility[] = ['required', 'optional', 'hidden', 'deferred'];
const FIELD_KEYS: (keyof DriverExpressConfig['fields'])[] = [
  'govName',
  'licensePlate',
  'vehicleMakeModel',
  'vehicleYear',
  'seatMap',
  'videoIntro',
  'adPhoto',
  'riderPreferences',
  'location',
  'areas',
];

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
  // Deep-merge `fields` so new field keys added to DriverExpressFields keep
  // their default visibility on configs that predate them. Without this, a
  // shallow merge would let stored.fields replace DEFAULTS.fields wholesale
  // and the admin UI would render with the new field missing.
  const config: DriverExpressConfig = stored
    ? {
        ...DRIVER_EXPRESS_DEFAULTS,
        ...(stored as DriverExpressConfig),
        fields: {
          ...DRIVER_EXPRESS_DEFAULTS.fields,
          ...((stored as DriverExpressConfig).fields ?? {}),
        },
      }
    : DRIVER_EXPRESS_DEFAULTS;
  return NextResponse.json({
    config,
    updated_at: rows[0]?.updated_at ?? null,
    updated_by: rows[0]?.updated_by ?? null,
    defaults: DRIVER_EXPRESS_DEFAULTS,
  });
}

function validate(body: unknown): { ok: true; value: DriverExpressConfig } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Partial<DriverExpressConfig>;

  const fields = b.fields as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== 'object') return { ok: false, error: 'fields missing' };
  for (const k of FIELD_KEYS) {
    const v = fields[k as string];
    if (typeof v !== 'string' || !VISIBILITY.includes(v as FieldVisibility)) {
      return { ok: false, error: `fields.${k} must be one of ${VISIBILITY.join(', ')}` };
    }
  }

  const tiers = b.pricingTiers as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(tiers) || tiers.length === 0) return { ok: false, error: 'pricingTiers required' };
  for (const t of tiers) {
    if (!t || typeof t !== 'object') return { ok: false, error: 'tier malformed' };
    if (typeof t.label !== 'string') return { ok: false, error: 'tier.label string' };
    for (const n of ['min', 'rate30', 'rate1h', 'rate2h']) {
      if (typeof t[n] !== 'number' || (t[n] as number) < 0) {
        return { ok: false, error: `tier.${n} must be a non-negative number` };
      }
    }
  }
  if (!tiers.some(t => t.default === true)) {
    return { ok: false, error: 'one tier must have default: true' };
  }

  if (typeof b.stopsFee !== 'number' || b.stopsFee < 0) return { ok: false, error: 'stopsFee number' };
  if (typeof b.waitPerMin !== 'number' || b.waitPerMin < 0) return { ok: false, error: 'waitPerMin number' };

  const sd = b.scheduleDefault;
  if (!sd || !Array.isArray(sd.days) || typeof sd.start !== 'string' || typeof sd.end !== 'string') {
    return { ok: false, error: 'scheduleDefault malformed' };
  }

  return {
    ok: true,
    value: {
      enabled: b.enabled !== false,
      fields: fields as unknown as DriverExpressConfig['fields'],
      pricingTiers: tiers as unknown as DriverExpressConfig['pricingTiers'],
      stopsFee: b.stopsFee,
      waitPerMin: b.waitPerMin,
      scheduleDefault: {
        days: sd.days as string[],
        start: sd.start,
        end: sd.end,
        noticeRequired: typeof sd.noticeRequired === 'string' ? sd.noticeRequired : '30min',
      },
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
  await logAdminAction(admin.id, 'onboarding_config_update', 'platform_config', KEY, { newValue: result.value });
  return NextResponse.json({ row: updated[0] });
}
