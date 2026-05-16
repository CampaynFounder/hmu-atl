// POST   /api/blast/[id]/fallback-pass/[targetId] — rider swiped left on a
//                                                    fallback driver card.
// DELETE /api/blast/[id]/fallback-pass/[targetId] — undo the dismiss
//                                                    (powers the "Undo" toast).
//
// Both write to blast_driver_events, NOT to blast_driver_targets — the
// underlying target row stays valid in case the rider later changes their
// mind (or the matching algorithm re-surfaces them via a bump). The offer
// board's GET query filters out targets that have a 'fallback_dismissed'
// event, which is how the card disappears.
//
// Distinct from the driver-side 'pass' event (the existing pass route,
// which lives at /targets/[targetId]/pass and means "driver declined").
// 'fallback_dismissed' is rider-side and only affects the deck UI.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

async function resolveRiderAndTarget(
  blastId: string,
  targetId: string,
): Promise<
  | { ok: true; riderId: string; driverId: string }
  | { ok: false; response: NextResponse }
> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User not found' }, { status: 404 }),
    };
  }
  const riderId = (userRows[0] as { id: string }).id;

  // Owner check + target existence in one query so a wrong blast id or
  // a target that belongs to a different blast both 404 cleanly.
  const rows = await sql`
    SELECT bdt.driver_id, hp.user_id AS rider_id
    FROM blast_driver_targets bdt
    JOIN hmu_posts hp ON hp.id = bdt.blast_id
    WHERE bdt.id = ${targetId}
      AND bdt.blast_id = ${blastId}
      AND hp.post_type = 'blast'
    LIMIT 1
  `;
  if (!rows.length) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Target not found' }, { status: 404 }),
    };
  }
  const row = rows[0] as { driver_id: string; rider_id: string };
  if (row.rider_id !== riderId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, riderId, driverId: row.driver_id };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { id: blastId, targetId } = await params;
  const a = await resolveRiderAndTarget(blastId, targetId);
  if (!a.ok) return a.response;

  await sql`
    INSERT INTO blast_driver_events (blast_id, driver_id, event_type, source, event_data)
    VALUES (
      ${blastId},
      ${a.driverId},
      'fallback_dismissed',
      'rider_action',
      ${JSON.stringify({ target_id: targetId })}::jsonb
    )
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { id: blastId, targetId } = await params;
  const a = await resolveRiderAndTarget(blastId, targetId);
  if (!a.ok) return a.response;

  // Remove ALL dismissal events for this (blast, driver) pair — covers the
  // case where a rider rapid-fires swipe-pass + undo + swipe-pass again
  // and we ended up with multiple rows.
  await sql`
    DELETE FROM blast_driver_events
    WHERE blast_id = ${blastId}
      AND driver_id = ${a.driverId}
      AND event_type = 'fallback_dismissed'
  `;
  return NextResponse.json({ ok: true });
}
