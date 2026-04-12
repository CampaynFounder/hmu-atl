import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// GET — fetch all notification configs
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT notification_type, enabled, admin_phone, excluded_user_ids, updated_at
    FROM admin_notification_config
    ORDER BY notification_type
  `;

  return NextResponse.json({
    configs: rows.map((r: Record<string, unknown>) => ({
      type: r.notification_type,
      enabled: r.enabled,
      adminPhone: r.admin_phone,
      excludedUserIds: r.excluded_user_ids || [],
      updatedAt: r.updated_at,
    })),
  });
}

// PATCH — update a notification config
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { type, enabled, adminPhone, excludedUserIds } = await req.json() as {
    type: string;
    enabled?: boolean;
    adminPhone?: string | null;
    excludedUserIds?: string[];
  };

  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });

  await sql`
    INSERT INTO admin_notification_config (notification_type, enabled, admin_phone, excluded_user_ids)
    VALUES (${type}, ${enabled ?? true}, ${adminPhone ?? null}, ${excludedUserIds ?? []})
    ON CONFLICT (notification_type) DO UPDATE SET
      enabled = COALESCE(${enabled ?? null}::boolean, admin_notification_config.enabled),
      admin_phone = CASE WHEN ${adminPhone !== undefined} THEN ${adminPhone ?? null} ELSE admin_notification_config.admin_phone END,
      excluded_user_ids = CASE WHEN ${excludedUserIds !== undefined} THEN ${excludedUserIds ?? []}::text[] ELSE admin_notification_config.excluded_user_ids END,
      updated_at = NOW()
  `;

  return NextResponse.json({ updated: true });
}
