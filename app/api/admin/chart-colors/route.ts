// GET/PATCH /api/admin/chart-colors
// Superadmin console for the driver earnings-chart palette (cash / HMU Pay /
// delivery). Persists to platform_config key `earnings_chart.palette`; the
// mobile chart picks it up off /driver/balance on next load — no app rebuild.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import {
  CHART_PALETTE_KEY,
  DEFAULT_CHART_PALETTE,
  getChartPalette,
  isValidHex,
  sanitizePalette,
  type ChartPalette,
} from '@/lib/earnings/chart-palette';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const palette = await getChartPalette();
  return NextResponse.json({ palette, defaults: DEFAULT_CHART_PALETTE });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Partial<ChartPalette>;

  // Validate every provided channel up front so we reject (not silently
  // default) a typo — the admin should see the error and fix it.
  for (const k of ['cash', 'hmuPay', 'delivery'] as const) {
    if (body[k] !== undefined && !isValidHex(body[k])) {
      return NextResponse.json(
        { error: `${k} must be a 6-digit hex color like #2CFF05` },
        { status: 400 },
      );
    }
  }

  // Merge onto the current palette so a partial PATCH only changes named channels.
  const current = await getChartPalette();
  const next = sanitizePalette({ ...current, ...body });

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${CHART_PALETTE_KEY}, ${JSON.stringify(next)}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;

  invalidatePlatformConfig(CHART_PALETTE_KEY);
  await logAdminAction(admin.id, 'earnings_chart_palette_update', 'platform_config', CHART_PALETTE_KEY, next);
  return NextResponse.json({ palette: next });
}
