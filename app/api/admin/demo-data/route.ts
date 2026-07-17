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
import { getDemoUserHandles, setDemoUserHandle } from '@/lib/demo/handles';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const [driver, rider, handles] = await Promise.all([
    getDemoDriverFinancials(), getDemoRiderHistory(), getDemoUserHandles(),
  ]);
  return NextResponse.json({ driver, rider, handles, demoConfigured: !!process.env.DEMO_LOGIN_PHONE });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as { section?: string; config?: unknown; handle?: unknown };

  // Public @handle update for a demo account (real driver_profiles/rider_profiles row).
  if (body.section === 'driver_handle' || body.section === 'rider_handle') {
    const role = body.section === 'driver_handle' ? 'driver' : 'rider';
    const result = await setDemoUserHandle(role, body.handle);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logAdminAction(admin.id, 'demo_handle_update', `${role}_profiles`, result.handles[role].userId ?? undefined, {
      role, handle: result.handles[role].handle,
    });
    return NextResponse.json({ handles: result.handles });
  }

  const key = body.section === 'driver' ? DEMO_DRIVER_KEY : body.section === 'rider' ? DEMO_RIDER_KEY : null;
  if (!key || typeof body.config !== 'object' || body.config === null) {
    return NextResponse.json({ error: "section ('driver'|'rider'|'driver_handle'|'rider_handle') required" }, { status: 400 });
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
