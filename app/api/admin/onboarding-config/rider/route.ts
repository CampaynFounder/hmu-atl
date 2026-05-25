// GET/PATCH /api/admin/onboarding-config/rider — admin-tunable rider
// ad-funnel onboarding settings. Stored in platform_config under
// 'onboarding.rider_ad_funnel'. Sibling of the driver endpoint at
// /api/admin/onboarding-config; kept separate so the validators don't
// have to fork on a discriminator.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import {
  RIDER_AD_FUNNEL_DEFAULTS,
  type RiderAdFunnelConfig,
} from '@/lib/onboarding/rider-ad-funnel-config';
import type { FieldVisibility } from '@/lib/onboarding/config';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const KEY = 'onboarding.rider_ad_funnel';
const VISIBILITY: FieldVisibility[] = ['required', 'optional', 'hidden', 'deferred'];
const FIELD_KEYS: (keyof RiderAdFunnelConfig['fields'])[] = ['handle', 'media', 'location', 'safetyChecks'];

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
  return NextResponse.json({
    config: stored ? { ...RIDER_AD_FUNNEL_DEFAULTS, ...stored } : RIDER_AD_FUNNEL_DEFAULTS,
    updated_at: rows[0]?.updated_at ?? null,
    updated_by: rows[0]?.updated_by ?? null,
    defaults: RIDER_AD_FUNNEL_DEFAULTS,
  });
}

function validate(body: unknown): { ok: true; value: RiderAdFunnelConfig } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Partial<RiderAdFunnelConfig>;

  const fields = b.fields as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== 'object') return { ok: false, error: 'fields missing' };
  for (const k of FIELD_KEYS) {
    const v = fields[k as string];
    if (typeof v !== 'string' || !VISIBILITY.includes(v as FieldVisibility)) {
      return { ok: false, error: `fields.${k} must be one of ${VISIBILITY.join(', ')}` };
    }
  }

  if (typeof b.confirmationCta !== 'string' || b.confirmationCta.trim().length === 0) {
    return { ok: false, error: 'confirmationCta must be a non-empty string' };
  }
  if (b.confirmationCta.length > 40) {
    return { ok: false, error: 'confirmationCta capped at 40 chars (button label)' };
  }

  if (typeof b.browseRoute !== 'string' || !b.browseRoute.startsWith('/')) {
    return { ok: false, error: 'browseRoute must be an absolute path starting with /' };
  }

  return {
    ok: true,
    value: {
      enabled: b.enabled !== false,
      fields: fields as unknown as RiderAdFunnelConfig['fields'],
      confirmationCta: b.confirmationCta.trim(),
      browseRoute: b.browseRoute,
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
  await logAdminAction(admin.id, 'onboarding_config_rider_update', 'platform_config', KEY, { newValue: result.value });
  return NextResponse.json({ row: updated[0] });
}
