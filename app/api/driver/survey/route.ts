import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

const ALLOWED_HOW_HEARD = new Set([
  'fb_group', 'instagram', 'tiktok', 'fb_ig_ad', 'friend', 'google', 'other',
]);
const ALLOWED_INTENT = new Set([
  'side_income', 'full_time', 'drive_friends', 'exploring',
]);

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { how_heard, driver_intent } = await req.json() as {
    how_heard?: string;
    driver_intent?: string;
  };

  if (!how_heard || !ALLOWED_HOW_HEARD.has(how_heard)) {
    return NextResponse.json({ error: 'invalid how_heard' }, { status: 400 });
  }
  if (!driver_intent || !ALLOWED_INTENT.has(driver_intent)) {
    return NextResponse.json({ error: 'invalid driver_intent' }, { status: 400 });
  }

  await sql`
    UPDATE users
    SET
      how_heard = ${how_heard},
      driver_intent = ${driver_intent},
      survey_shown_at = COALESCE(survey_shown_at, NOW()),
      survey_completed_at = NOW(),
      updated_at = NOW()
    WHERE clerk_id = ${clerkId}
  `;

  return NextResponse.json({ ok: true });
}
