// Admin cold-start prevention config — GET current state, PATCH to change.
// Super-admin only: it changes prod compute billing. Mirrors the down-bad-config
// route's auth/audit pattern.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import {
  getColdStartConfig,
  saveColdStartConfig,
  applyColdStartToNeon,
  appliedSuspendSeconds,
  neonApiConfigured,
  WARM_PRESETS,
  type ColdStartConfig,
} from '@/lib/infra/cold-start';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const config = await getColdStartConfig();
  return NextResponse.json({
    config,
    appliedSeconds: appliedSuspendSeconds(config),
    neonConfigured: neonApiConfigured(),
    editable: admin.is_super,
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Partial<ColdStartConfig>;

  if (typeof body.keep_warm !== 'boolean') {
    return NextResponse.json({ error: 'keep_warm (boolean) is required' }, { status: 400 });
  }
  // Only the two presets are allowed for the warm window.
  const allowed: number[] = [WARM_PRESETS.ONE_HOUR, WARM_PRESETS.ALWAYS];
  if (body.suspend_timeout_seconds !== undefined && !allowed.includes(body.suspend_timeout_seconds)) {
    return NextResponse.json(
      { error: `suspend_timeout_seconds must be one of ${allowed.join(', ')}` },
      { status: 400 },
    );
  }

  const config: ColdStartConfig = {
    keep_warm: body.keep_warm,
    suspend_timeout_seconds: body.suspend_timeout_seconds ?? WARM_PRESETS.ALWAYS,
  };

  // Persist first so the choice survives even if the Neon apply transiently
  // fails — the admin sees the saved state and the apply error separately.
  await saveColdStartConfig(config, admin.id);

  const applied = appliedSuspendSeconds(config);
  const neon = await applyColdStartToNeon(applied);

  await logAdminAction(admin.id, 'cold_start_config_update', 'platform_config', 'infra.cold_start', {
    config,
    appliedSeconds: applied,
    neonApplied: neon.ok,
    neonError: neon.error ?? null,
  });

  return NextResponse.json({
    config,
    appliedSeconds: applied,
    neonConfigured: neonApiConfigured(),
    neon,
  });
}
