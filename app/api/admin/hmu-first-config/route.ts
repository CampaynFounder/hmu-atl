// GET/PATCH /api/admin/hmu-first-config — superadmin control for HMU First.
// GET   → { enabled, priceCents }
// PATCH → body { enabled?: boolean, priceCents?: number } (merged) → { enabled, priceCents }
// Stored in platform_config under `hmu_first.config`.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import {
  getHmuFirstConfig, HMU_FIRST_CONFIG_KEY,
  HMU_FIRST_MIN_CENTS, HMU_FIRST_MAX_CENTS,
} from '@/lib/hmu-first';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const cfg = await getHmuFirstConfig();
  return NextResponse.json(cfg);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    priceCents?: number;
  };

  // Merge onto the current config so a partial PATCH never drops the other field.
  const current = await getHmuFirstConfig();
  const next = { ...current };

  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;

  if (body.priceCents !== undefined) {
    const cents = Math.round(Number(body.priceCents));
    if (!Number.isFinite(cents) || cents < HMU_FIRST_MIN_CENTS || cents > HMU_FIRST_MAX_CENTS) {
      return NextResponse.json(
        { error: `priceCents must be between ${HMU_FIRST_MIN_CENTS} and ${HMU_FIRST_MAX_CENTS}` },
        { status: 400 },
      );
    }
    next.priceCents = cents;
  }

  const jsonValue = JSON.stringify(next);
  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${HMU_FIRST_CONFIG_KEY}, ${jsonValue}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;

  invalidatePlatformConfig(HMU_FIRST_CONFIG_KEY);
  await logAdminAction(admin.id, 'hmu_first_config_update', 'platform_config', HMU_FIRST_CONFIG_KEY, next);
  return NextResponse.json(next);
}
