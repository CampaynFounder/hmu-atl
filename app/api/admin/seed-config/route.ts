// GET  /api/admin/seed-config — read seed browse-placement config
// PATCH /api/admin/seed-config — set it { mode: 'off' | 'top' }
// Super-admin only. Controls whether seed drivers pin to the top of browse.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { getPlatformConfig, invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'browse.seed_placement';
type Mode = 'off' | 'top';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const cfg = await getPlatformConfig(KEY, { mode: 'off' as Mode });
  return NextResponse.json({ mode: cfg.mode });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  if (body.mode !== 'off' && body.mode !== 'top') {
    return NextResponse.json({ error: "mode must be 'off' or 'top'" }, { status: 400 });
  }

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${KEY}, ${JSON.stringify({ mode: body.mode })}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;
  invalidatePlatformConfig(KEY);
  await logAdminAction(admin.id, 'seed_config.update', 'platform_config', KEY, { mode: body.mode });

  return NextResponse.json({ mode: body.mode });
}
