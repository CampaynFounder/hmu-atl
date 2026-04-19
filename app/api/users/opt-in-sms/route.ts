// Self-service opt-in / opt-out for conversational SMS.
// GET returns current opt-in state so the banner can hide itself client-side.
// POST { opt_in: boolean } writes users.opt_in_sms. Dismissal is tracked via
// cookie — POST { dismissed: true } sets the cookie only.
//
// On opt_in=true, we schedule the first conversation message. The scheduler
// double-checks opt_in_sms from DB and bails if the thread already exists,
// so this is safe to call on every opt-in POST.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { scheduleFirstMessageForUser } from '@/lib/conversation/scheduler';

const DISMISS_COOKIE = 'hmu_sms_prompt_dismissed';
const DISMISS_MAX_AGE_S = 60 * 60 * 24 * 7;  // 7 days

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await sql`SELECT opt_in_sms FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  const row = rows[0] as { opt_in_sms: boolean } | undefined;
  return NextResponse.json({ opt_in_sms: !!row?.opt_in_sms });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { opt_in?: boolean; dismissed?: boolean };

  if (typeof body.opt_in === 'boolean') {
    await sql`UPDATE users SET opt_in_sms = ${body.opt_in}, updated_at = NOW() WHERE clerk_id = ${clerkId}`;

    if (body.opt_in === true) {
      // Gender isn't known yet at opt-in time (profile may not exist). Neutral
      // persona ("Sky") wins the any/any match until a profile is set.
      try {
        // gender is not tracked in driver/rider profile schema today, so we
        // always pass null — pickPersonaForUser falls back to the neutral
        // persona (Sky) which has gender_match = 'any'.
        const rows = await sql`
          SELECT id, profile_type, phone FROM users WHERE clerk_id = ${clerkId} LIMIT 1
        `;
        const u = rows[0] as { id: string; profile_type: 'driver' | 'rider' | 'admin'; phone: string | null } | undefined;
        if (u?.phone && (u.profile_type === 'driver' || u.profile_type === 'rider')) {
          await scheduleFirstMessageForUser({
            userId: u.id,
            phone: u.phone,
            profileType: u.profile_type,
            gender: null,
          });
        }
      } catch (err) {
        // Never block the opt-in response on scheduling failure.
        console.error('[opt-in-sms] schedule failed:', err);
      }
    }
  }

  // Opt-in AND dismissal both silence the banner; we always drop the cookie
  // on any POST to this route so the banner goes away either way.
  const res = NextResponse.json({ ok: true, opt_in_sms: body.opt_in ?? null });
  res.cookies.set(DISMISS_COOKIE, '1', {
    maxAge: DISMISS_MAX_AGE_S,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return res;
}
