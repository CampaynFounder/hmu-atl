// GET   /api/admin/admin-alerts — read super-admin push toggles
// PATCH /api/admin/admin-alerts — update { rideRequests?, dailySummary? }
// POST  /api/admin/admin-alerts — send a test daily-summary push now
// Super-admin only.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import { getAdminPushConfig, sendDailySummary } from '@/lib/admin/push-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'admin.push_alerts';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  return NextResponse.json(await getAdminPushConfig());
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getAdminPushConfig();
  const next = {
    rideRequests: typeof body.rideRequests === 'boolean' ? body.rideRequests : current.rideRequests,
    dailySummary: typeof body.dailySummary === 'boolean' ? body.dailySummary : current.dailySummary,
  };

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${KEY}, ${JSON.stringify(next)}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `;
  invalidatePlatformConfig(KEY);
  await logAdminAction(admin.id, 'admin_alerts.update', 'platform_config', KEY, next);
  return NextResponse.json(next);
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const result = await sendDailySummary();
  return NextResponse.json({ ok: true, ...result });
}
