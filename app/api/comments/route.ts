// POST /api/comments
// Submit a post-ride comment. Riders leave the initial comment; drivers reply.
// Limits (maxChars, maxInitialPerRide, maxRepliesPerRide) are read from platform_config.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = { maxChars: 160, maxInitialPerRide: 1, maxDriverInitialPerRide: 1, maxRepliesPerRide: 1 };

async function getCommentConfig() {
  const rows = await sql`SELECT config_value FROM platform_config WHERE config_key = 'comments.settings' LIMIT 1`;
  if (!rows.length) return DEFAULT_CONFIG;
  const v = rows[0].config_value as Record<string, number>;
  return {
    maxChars: v.maxChars ?? DEFAULT_CONFIG.maxChars,
    maxInitialPerRide: v.maxInitialPerRide ?? DEFAULT_CONFIG.maxInitialPerRide,
    maxDriverInitialPerRide: v.maxDriverInitialPerRide ?? DEFAULT_CONFIG.maxDriverInitialPerRide,
    maxRepliesPerRide: v.maxRepliesPerRide ?? DEFAULT_CONFIG.maxRepliesPerRide,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const content: string = (body.content ?? '').trim();
    const rideId: string = body.rideId ?? '';
    const parentId: string | null = body.parentId ?? null;

    if (!rideId) return NextResponse.json({ error: 'rideId required' }, { status: 400 });

    const config = await getCommentConfig();

    if (!content || content.length > config.maxChars) {
      return NextResponse.json({ error: `Content must be 1–${config.maxChars} characters` }, { status: 400 });
    }

    const authorRows = await sql`
      SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
    `;
    if (!authorRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const author = authorRows[0] as { id: string; profile_type: string };

    // Verify ride is completed and author is a participant
    const rideRows = await sql`
      SELECT id, rider_id, driver_id FROM rides
      WHERE id = ${rideId}
        AND status IN ('completed', 'ended')
      LIMIT 1
    `;
    if (!rideRows.length) {
      return NextResponse.json({ error: 'Ride not found or not completed' }, { status: 404 });
    }
    const ride = rideRows[0] as { id: string; rider_id: string; driver_id: string };

    const isRider  = author.profile_type === 'rider'  && author.id === ride.rider_id;
    const isDriver = author.profile_type === 'driver' && author.id === ride.driver_id;

    if (!isRider && !isDriver) {
      return NextResponse.json({ error: 'Not a participant on this ride' }, { status: 403 });
    }

    // Count existing comments on this ride by this author
    const countRows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE parent_id IS NULL)  AS initial_count,
        COUNT(*) FILTER (WHERE parent_id IS NOT NULL) AS reply_count
      FROM comments
      WHERE ride_id = ${rideId}
        AND author_id = ${author.id}
        AND deleted_at IS NULL
    `;
    const initialCount = parseInt((countRows[0] as { initial_count: string }).initial_count ?? '0');
    const replyCount   = parseInt((countRows[0] as { reply_count: string }).reply_count   ?? '0');

    // Determine subject (the other participant)
    const subjectId = isRider ? ride.driver_id : ride.rider_id;

    if (isRider) {
      if (parentId) {
        return NextResponse.json({ error: 'Riders leave top-level comments, not replies' }, { status: 400 });
      }
      if (initialCount >= config.maxInitialPerRide) {
        return NextResponse.json({ error: 'Comment limit reached for this ride' }, { status: 429 });
      }
    } else {
      // Driver: can post an initial comment (no parentId) or reply to an existing one
      if (!parentId) {
        if (initialCount >= config.maxDriverInitialPerRide) {
          return NextResponse.json({ error: 'Comment limit reached for this ride' }, { status: 429 });
        }
      } else {
        const parentRows = await sql`
          SELECT id FROM comments
          WHERE id = ${parentId} AND ride_id = ${rideId} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (!parentRows.length) {
          return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
        }
        if (replyCount >= config.maxRepliesPerRide) {
          return NextResponse.json({ error: 'Reply limit reached for this ride' }, { status: 429 });
        }
      }
    }

    const result = await sql`
      INSERT INTO comments (ride_id, author_id, subject_id, content, parent_id, is_visible, flagged_for_review)
      VALUES (
        ${rideId},
        ${author.id},
        ${subjectId},
        ${content},
        ${parentId},
        true,
        false
      )
      RETURNING id, created_at
    `;

    return NextResponse.json({ id: (result[0] as { id: string }).id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/comments]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
