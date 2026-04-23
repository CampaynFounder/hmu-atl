import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// <input type="date"> requires exactly YYYY-MM-DD. Neon returns DATE columns
// as either Date objects or ISO timestamps, so normalize both here.
function toDateString(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// GET — fetch all notification configs
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT notification_type, enabled, admin_phone, excluded_user_ids, signup_after, exclude_before, updated_at
    FROM admin_notification_config
    ORDER BY notification_type
  `;

  return NextResponse.json({
    configs: rows.map((r: Record<string, unknown>) => ({
      type: r.notification_type,
      enabled: r.enabled,
      adminPhone: r.admin_phone,
      excludedUserIds: r.excluded_user_ids || [],
      signupAfter: toDateString(r.signup_after),
      excludeBefore: toDateString(r.exclude_before),
      updatedAt: r.updated_at,
    })),
  });
}

// PATCH — update a notification config
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { type, enabled, adminPhone, excludedUserIds, signupAfter, excludeBefore } = await req.json() as {
    type: string;
    enabled?: boolean;
    adminPhone?: string | null;
    excludedUserIds?: string[];
    signupAfter?: string | null;
    excludeBefore?: string | null;
  };

  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });

  await sql`
    INSERT INTO admin_notification_config (notification_type, enabled, admin_phone, excluded_user_ids, signup_after, exclude_before)
    VALUES (${type}, ${enabled ?? true}, ${adminPhone ?? null}, ${excludedUserIds ?? []}, ${signupAfter ?? null}, ${excludeBefore ?? null})
    ON CONFLICT (notification_type) DO UPDATE SET
      enabled = COALESCE(${enabled ?? null}::boolean, admin_notification_config.enabled),
      admin_phone = CASE WHEN ${adminPhone !== undefined} THEN ${adminPhone ?? null} ELSE admin_notification_config.admin_phone END,
      excluded_user_ids = CASE WHEN ${excludedUserIds !== undefined} THEN ${excludedUserIds ?? []}::text[] ELSE admin_notification_config.excluded_user_ids END,
      signup_after = CASE WHEN ${signupAfter !== undefined} THEN ${signupAfter ?? null}::date ELSE admin_notification_config.signup_after END,
      exclude_before = CASE WHEN ${excludeBefore !== undefined} THEN ${excludeBefore ?? null}::date ELSE admin_notification_config.exclude_before END,
      updated_at = NOW()
  `;

  return NextResponse.json({ updated: true });
}
