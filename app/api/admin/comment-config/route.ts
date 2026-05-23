// GET  /api/admin/comment-config — read current comment settings
// PATCH /api/admin/comment-config — update comment settings
// Stored under platform_config key 'comments.settings'.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONFIG_KEY = 'comments.settings';
const DEFAULTS = { maxChars: 160, maxInitialPerRide: 1, maxRepliesPerRide: 1 };

async function assertAdmin(clerkId: string): Promise<string> {
  const rows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || (rows[0] as { profile_type: string }).profile_type !== 'admin') {
    throw new Error('Admin only');
  }
  return (rows[0] as { id: string }).id;
}

export async function GET(_req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { await assertAdmin(clerkId); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const rows = await sql`SELECT config_value, updated_at FROM platform_config WHERE config_key = ${CONFIG_KEY} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ config: DEFAULTS, updatedAt: null });

  const row = rows[0] as { config_value: Record<string, number>; updated_at: string };
  return NextResponse.json({
    config: { ...DEFAULTS, ...row.config_value },
    updatedAt: row.updated_at,
  });
}

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let adminId: string;
  try { adminId = await assertAdmin(clerkId); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const body = await req.json();

  const maxChars          = Math.max(1,  Math.min(2000, Number(body.maxChars)          || DEFAULTS.maxChars));
  const maxInitialPerRide = Math.max(1,  Math.min(20,   Number(body.maxInitialPerRide) || DEFAULTS.maxInitialPerRide));
  const maxRepliesPerRide = Math.max(0,  Math.min(20,   Number(body.maxRepliesPerRide) || DEFAULTS.maxRepliesPerRide));

  const next = { maxChars, maxInitialPerRide, maxRepliesPerRide };
  const json = JSON.stringify(next);

  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${CONFIG_KEY}, ${json}::jsonb, ${adminId}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = EXCLUDED.updated_at
  `;

  return NextResponse.json({ ok: true, config: next });
}
