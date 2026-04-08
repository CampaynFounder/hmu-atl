import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

/** GET — fetch current chill score config */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify admin
  const userRows = await sql`SELECT profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length || (userRows[0] as { profile_type: string }).profile_type !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const rows = await sql`SELECT config_value, updated_at, updated_by FROM platform_config WHERE config_key = 'chill_score' LIMIT 1`;
  if (!rows.length) return NextResponse.json({ config: getDefaults(), updatedAt: null, updatedBy: null });

  const row = rows[0] as { config_value: Record<string, unknown>; updated_at: string; updated_by: string };
  return NextResponse.json({
    config: { ...getDefaults(), ...row.config_value },
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  });
}

/** PATCH — update chill score config */
export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length || (userRows[0] as { profile_type: string }).profile_type !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const current = await sql`SELECT config_value FROM platform_config WHERE config_key = 'chill_score' LIMIT 1`;
  const existing = current.length ? (current[0] as { config_value: Record<string, unknown> }).config_value : {};
  const merged = { ...getDefaults(), ...existing, ...body };

  await sql`
    UPDATE platform_config SET
      config_value = ${JSON.stringify(merged)}::jsonb,
      updated_by = ${clerkId},
      updated_at = NOW()
    WHERE config_key = 'chill_score'
  `;

  return NextResponse.json({ config: merged });
}

function getDefaults() {
  return {
    coolAfMultiplier: 0.5,
    chillMultiplier: 0.2,
    creepyMultiplier: 1.5,
    weirdoMultiplier: 3.0,
    baseWeight: 20,
    minWeight: 2,
    coolAfMin: 90,
    chillMin: 75,
    aightMin: 50,
    sketchyMin: 25,
    inactivityDays: 30,
    decayPerWeek: 1,
    decayFloor: 75,
    weirdoAutoReviewCount: 3,
    retaliationWindowMinutes: 5,
  };
}
