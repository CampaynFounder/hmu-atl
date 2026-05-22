// POST /api/comments
// Submit a post-ride comment about a user.
// Role rule: riders comment on drivers, drivers comment on riders.
// Requires: completed ride between the author and subject.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const content: string = (body.content ?? '').trim();
  const subjectId: string = body.subjectId ?? '';
  const rideId: string | null = body.rideId ?? null;

  if (!content || content.length > 500) {
    return NextResponse.json({ error: 'Content must be 1–500 characters' }, { status: 400 });
  }
  if (!subjectId) {
    return NextResponse.json({ error: 'subjectId required' }, { status: 400 });
  }

  const authorRows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!authorRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const author = authorRows[0] as { id: string; profile_type: string };

  const subjectRows = await sql`
    SELECT id, profile_type FROM users WHERE id = ${subjectId} LIMIT 1
  `;
  if (!subjectRows.length) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
  const subject = subjectRows[0] as { id: string; profile_type: string };

  // Role enforcement: rider→driver or driver→rider only
  const validPair =
    (author.profile_type === 'rider' && subject.profile_type === 'driver') ||
    (author.profile_type === 'driver' && subject.profile_type === 'rider');
  if (!validPair) {
    return NextResponse.json({ error: 'Invalid comment direction' }, { status: 403 });
  }

  // Require a completed ride between author and subject
  const rideCheck = await sql`
    SELECT id FROM rides
    WHERE status IN ('completed', 'ended')
      AND (
        (driver_id = ${author.id} AND rider_id = ${subject.id})
        OR
        (rider_id = ${author.id} AND driver_id = ${subject.id})
      )
    LIMIT 1
  `;
  if (!rideCheck.length) {
    return NextResponse.json({ error: 'Must complete a ride together first' }, { status: 403 });
  }

  const result = await sql`
    INSERT INTO comments (ride_id, author_id, subject_id, content, is_visible, flagged_for_review)
    VALUES (
      ${rideId ?? rideCheck[0].id},
      ${author.id},
      ${subject.id},
      ${content},
      true,
      false
    )
    RETURNING id, created_at
  `;

  return NextResponse.json({ id: (result[0] as { id: string }).id }, { status: 201 });
}
