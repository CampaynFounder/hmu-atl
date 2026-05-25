// GET/PATCH /api/admin/rider-browse-banner — config for the driver-recruit
// banner at the top of /rider/browse. Stored in platform_config under
// 'rider_browse.banner'. Super admin only for PATCH; any admin can read.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import {
  RIDER_BROWSE_BANNER_DEFAULTS,
  RIDER_BROWSE_BANNER_KEY,
  sanitizeRiderBrowseBanner,
  type RiderBrowseBannerConfig,
} from '@/lib/admin/rider-browse-banner';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.browsebanner.view')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_value, updated_at, updated_by
    FROM platform_config
    WHERE config_key = ${RIDER_BROWSE_BANNER_KEY}
    LIMIT 1
  ` as Array<{ config_value: Partial<RiderBrowseBannerConfig>; updated_at: string; updated_by: string }>;

  return NextResponse.json({
    config: { ...RIDER_BROWSE_BANNER_DEFAULTS, ...(rows[0]?.config_value ?? {}) },
    defaults: RIDER_BROWSE_BANNER_DEFAULTS,
    updated_at: rows[0]?.updated_at ?? null,
    updated_by: rows[0]?.updated_by ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.browsebanner.edit')) return unauthorizedResponse();

  const body = await req.json().catch(() => null) as Partial<RiderBrowseBannerConfig> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body must be an object' }, { status: 400 });
  }

  const next = sanitizeRiderBrowseBanner(body);
  const json = JSON.stringify(next);
  const updated = await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${RIDER_BROWSE_BANNER_KEY}, ${json}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_value, updated_at
  `;

  invalidatePlatformConfig(RIDER_BROWSE_BANNER_KEY);
  await logAdminAction(admin.id, 'rider_browse_banner_update', 'platform_config', RIDER_BROWSE_BANNER_KEY, { newValue: next });

  return NextResponse.json({ config: next, updated_at: updated[0]?.updated_at });
}
