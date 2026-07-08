// GET/PATCH /api/admin/account-deletion
// Superadmin toggle for whether the mobile app exposes account deletion.
// Persists to platform_config key `account.deletion`; the mobile app reads the
// resolved value off /users/me on next load — no app rebuild. Defaults ON.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import { ACCOUNT_DELETION_KEY, getAccountDeletionConfig } from '@/lib/features/account-deletion';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const config = await getAccountDeletionConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }
  const next = { enabled: body.enabled };

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${ACCOUNT_DELETION_KEY}, ${JSON.stringify(next)}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
  `;

  invalidatePlatformConfig(ACCOUNT_DELETION_KEY);
  await logAdminAction(admin.id, 'account_deletion_toggle', 'platform_config', ACCOUNT_DELETION_KEY, next);
  return NextResponse.json({ config: next });
}
