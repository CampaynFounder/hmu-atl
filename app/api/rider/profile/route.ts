// Minimal rider profile update endpoint. Currently scoped to fields the
// ad-funnel onboarding needs (handle); broaden as new flows ship rather
// than upfront — keeps the surface area honest.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { updateRiderProfile } from '@/lib/db/profiles';

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const handleRaw = typeof body.handle === 'string' ? body.handle.trim() : '';

  if (!handleRaw) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const normalized = handleRaw.toLowerCase().replace(/\s+/g, '');
  if (normalized.length < 2 || !/^[a-z0-9_-]+$/.test(normalized)) {
    return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });
  }

  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (userRows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = userRows[0].id as string;

  try {
    const updated = await updateRiderProfile(userId, { handle: normalized });
    return NextResponse.json({ ok: true, handle: updated.handle });
  } catch (err) {
    // 23505 = unique_violation. Race against another rider claiming the same
    // handle between the check and the write.
    const msg = err instanceof Error ? err.message : '';
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json({ error: 'Handle already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not update' }, { status: 500 });
  }
}
