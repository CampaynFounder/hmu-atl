import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveSafetyPrefs, getPlatformSafetyConfig, clampInterval } from '@/lib/safety/config';
import { checkRateLimit } from '@/lib/rate-limit/check';
import type { ProfileType } from '@/lib/db/types';

async function loadUser(clerkId: string): Promise<{ id: string; profile_type: ProfileType } | null> {
  const rows = (await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ id: string; profile_type: ProfileType }>;
  return rows[0] ?? null;
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await loadUser(clerkId);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const prefs = await resolveSafetyPrefs(user.id, user.profile_type);
  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rl = await checkRateLimit({
    key: `safety-prefs:${clerkId}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  const user = await loadUser(clerkId);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    enabled?: boolean;
    interval_minutes?: number | null;
  } | null;
  if (!body) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  // Clamp interval if supplied; null explicitly clears override → falls back to platform default.
  let intervalToStore: number | null | undefined = undefined;
  if (body.interval_minutes === null) {
    intervalToStore = null;
  } else if (typeof body.interval_minutes === 'number') {
    const cfg = await getPlatformSafetyConfig();
    intervalToStore = clampInterval(cfg, body.interval_minutes);
  }

  const enabledToStore = typeof body.enabled === 'boolean' ? body.enabled : undefined;

  // Only write the columns the caller supplied. COALESCE keeps existing value
  // for columns the caller didn't touch.
  await sql`
    INSERT INTO user_preferences (user_id, safety_checks_enabled, safety_check_interval_minutes)
    VALUES (
      ${user.id},
      ${enabledToStore ?? true},
      ${intervalToStore ?? null}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      safety_checks_enabled = COALESCE(${enabledToStore ?? null}, user_preferences.safety_checks_enabled),
      safety_check_interval_minutes = CASE
        WHEN ${intervalToStore === undefined}::boolean THEN user_preferences.safety_check_interval_minutes
        ELSE ${intervalToStore}
      END,
      updated_at = NOW()
  `;

  const prefs = await resolveSafetyPrefs(user.id, user.profile_type);
  return NextResponse.json(prefs);
}
