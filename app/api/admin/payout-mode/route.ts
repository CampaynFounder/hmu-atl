// GET/PATCH /api/admin/payout-mode
// Superadmin console for the driver payout onboarding mode (browser / embedded /
// native). Persists to platform_config key `driver.payout_mode`; the mobile app
// reads the resolved mode off /driver/payout-setup on next load — no app rebuild.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import {
  PAYOUT_MODE_KEY,
  PAYOUT_MODES,
  getPayoutModeConfig,
  isPayoutMode,
} from '@/lib/payments/payout-mode';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const config = await getPayoutModeConfig();
  return NextResponse.json({ config, modes: PAYOUT_MODES });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  if (!isPayoutMode(body.mode)) {
    return NextResponse.json(
      { error: `mode must be one of: ${PAYOUT_MODES.join(', ')}` },
      { status: 400 },
    );
  }
  const next = { mode: body.mode };

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${PAYOUT_MODE_KEY}, ${JSON.stringify(next)}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;

  invalidatePlatformConfig(PAYOUT_MODE_KEY);
  await logAdminAction(admin.id, 'payout_mode_update', 'platform_config', PAYOUT_MODE_KEY, next);
  return NextResponse.json({ config: next });
}
