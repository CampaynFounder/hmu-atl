import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  const user = rows[0] as { id: string } | undefined;
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json() as {
    hide_tips?: boolean;
    checklist_dismissed_at?: string | null;
  };

  await sql`
    INSERT INTO user_preferences (user_id, hide_tips, checklist_dismissed_at)
    VALUES (
      ${user.id},
      ${body.hide_tips ?? false},
      ${body.checklist_dismissed_at ?? null}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      hide_tips = COALESCE(${body.hide_tips ?? null}, user_preferences.hide_tips),
      checklist_dismissed_at = COALESCE(${body.checklist_dismissed_at ?? null}, user_preferences.checklist_dismissed_at),
      updated_at = NOW()
  `;

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT up.hide_tips, up.checklist_dismissed_at
    FROM users u
    LEFT JOIN user_preferences up ON up.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  const row = rows[0] as { hide_tips: boolean | null; checklist_dismissed_at: Date | null } | undefined;
  return NextResponse.json({
    hide_tips: row?.hide_tips ?? false,
    checklist_dismissed_at: row?.checklist_dismissed_at ?? null,
  });
}
