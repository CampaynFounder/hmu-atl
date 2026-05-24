// GET /api/rides/[id]/comments
// Returns the post-ride comment thread for a specific ride, plus capability metadata
// for the current user. Only accessible to the rider and driver on the ride.

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: rideId } = await params;

  const userRows = await sql`
    SELECT u.id, u.profile_type, r.rider_id, r.driver_id, r.status
    FROM users u
    CROSS JOIN rides r
    WHERE u.clerk_id = ${clerkId}
      AND r.id = ${rideId}
    LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });

  const row = userRows[0] as {
    id: string; profile_type: string;
    rider_id: string; driver_id: string; status: string;
  };

  if (row.id !== row.rider_id && row.id !== row.driver_id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Only allow on completed/ended rides
  if (!['completed', 'ended'].includes(row.status)) {
    return NextResponse.json({ thread: [], canPost: false, postType: null, replyToId: null, maxChars: DEFAULT_CONFIG.maxChars });
  }

  const config = await getCommentConfig();

  const rawComments = await sql`
    SELECT
      c.id,
      c.content,
      c.redacted_content,
      c.admin_note,
      c.is_visible,
      c.parent_id,
      c.author_id,
      c.created_at,
      adp.handle        AS driver_handle,
      adp.display_name  AS driver_name,
      rp.handle         AS rider_handle,
      rp.display_name   AS rider_name,
      u.profile_type    AS author_role
    FROM comments c
    JOIN users u ON u.id = c.author_id
    LEFT JOIN driver_profiles adp ON adp.user_id = c.author_id
    LEFT JOIN rider_profiles  rp  ON rp.user_id  = c.author_id
    WHERE c.ride_id = ${rideId}
      AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
  `;

  type RawComment = {
    id: string; content: string; redacted_content: string | null;
    admin_note: string | null; is_visible: boolean; parent_id: string | null;
    author_id: string; created_at: string; driver_handle: string | null;
    driver_name: string | null; rider_handle: string | null; rider_name: string | null;
    author_role: string;
  };

  function toDisplay(c: RawComment) {
    return {
      id: c.id,
      displayContent: c.redacted_content ?? c.content,
      isRedacted: !!c.redacted_content,
      adminNote: c.admin_note,
      isVisible: c.is_visible,
      parentId: c.parent_id,
      authorId: c.author_id,
      authorHandle: c.driver_handle ?? c.rider_handle ?? null,
      authorName: c.driver_name ?? c.rider_name ?? 'User',
      authorRole: c.author_role,
      createdAt: c.created_at,
    };
  }

  const topLevel = (rawComments as RawComment[]).filter(c => !c.parent_id);
  const replies   = (rawComments as RawComment[]).filter(c => !!c.parent_id);

  const thread = topLevel.map(c => ({
    ...toDisplay(c),
    replies: replies.filter(r => r.parent_id === c.id).map(toDisplay),
  }));

  // Determine what the current user can do next
  const isRider  = row.id === row.rider_id;
  const isDriver = row.id === row.driver_id;

  const myInitialCount = (rawComments as RawComment[]).filter(c => c.author_id === row.id && !c.parent_id).length;
  const myReplyCount   = (rawComments as RawComment[]).filter(c => c.author_id === row.id && !!c.parent_id).length;

  let canPost = false;
  let postType: 'initial' | 'reply' | null = null;
  let replyToId: string | null = null;

  if (isRider && myInitialCount < config.maxInitialPerRide) {
    canPost = true;
    postType = 'initial';
  } else if (isDriver) {
    // Top-level comments made by the other participant (the rider)
    const otherTopLevel = topLevel.filter(c => c.author_id !== row.id);
    if (myInitialCount < config.maxDriverInitialPerRide) {
      canPost = true;
      postType = 'initial';
    } else if (otherTopLevel.length > 0 && myReplyCount < config.maxRepliesPerRide) {
      canPost = true;
      postType = 'reply';
      replyToId = otherTopLevel[otherTopLevel.length - 1].id;
    }
  }

  return NextResponse.json({ thread, canPost, postType, replyToId, maxChars: config.maxChars });
}
