// GET/PATCH /api/admin/demo-data
// Superadmin console for the App Store reviewer demo accounts' fake data.
// Persists to platform_config keys demo.driver_financials + demo.rider_history.
// The driver balance/analytics/earnings + rider ride-history endpoints return
// these values for the demo accounts (gated by isDemoPhone). No app rebuild.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import {
  DEMO_DRIVER_KEY, DEMO_RIDER_KEY,
  getDemoDriverFinancials, getDemoRiderHistory,
} from '@/lib/demo/data';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const [driver, rider] = await Promise.all([getDemoDriverFinancials(), getDemoRiderHistory()]);
  return NextResponse.json({ driver, rider, demoConfigured: !!process.env.DEMO_LOGIN_PHONE });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as { section?: string; config?: unknown };
  const key = body.section === 'driver' ? DEMO_DRIVER_KEY : body.section === 'rider' ? DEMO_RIDER_KEY : null;
  if (!key || typeof body.config !== 'object' || body.config === null) {
    return NextResponse.json({ error: "section ('driver'|'rider') and config object required" }, { status: 400 });
  }

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${key}, ${JSON.stringify(body.config)}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;

  invalidatePlatformConfig(key);
  await logAdminAction(admin.id, 'demo_data_update', 'platform_config', key, { section: body.section });

  const [driver, rider] = await Promise.all([getDemoDriverFinancials(), getDemoRiderHistory()]);
  return NextResponse.json({ driver, rider });
}
