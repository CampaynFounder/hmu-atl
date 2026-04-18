import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await sql`
    UPDATE users
    SET
      survey_shown_at = COALESCE(survey_shown_at, NOW()),
      survey_skipped_at = NOW(),
      updated_at = NOW()
    WHERE clerk_id = ${clerkId}
  `;

  return NextResponse.json({ ok: true });
}
