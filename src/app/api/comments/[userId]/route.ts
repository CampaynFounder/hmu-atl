import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import sql from '../../../../../lib/db/client';
import { ratelimit } from '../../../../../lib/ratelimit';

// Tier-based comment visibility rules:
// - HMU First drivers can see rider comments on their profile
// - OG riders can see driver comments on their profile
// - Standard users see neither

type UserTier = 'standard' | 'hmufirst' | 'og';

async function getViewerTier(viewerClerkId: string): Promise<{ tier: UserTier; dbId: string | null }> {
  const userRows = await sql`
    SELECT id, user_type FROM users WHERE auth_provider_id = ${viewerClerkId} LIMIT 1
  `.catch(() => []);

  if (!userRows.length) return { tier: 'standard', dbId: null };

  const { id: dbId, user_type } = userRows[0] as { id: string; user_type: string };

  // Check OG rider status
  if (user_type === 'rider' || user_type === 'both') {
    const riderRows = await sql`
      SELECT og_status FROM rider_profiles WHERE user_id = ${dbId} LIMIT 1
    `.catch(() => []);
    if (riderRows.length && (riderRows[0] as { og_status?: boolean }).og_status) {
      return { tier: 'og', dbId };
    }
  }

  // Check HMU First driver status
  if (user_type === 'driver' || user_type === 'both') {
    const driverRows = await sql`
      SELECT hmu_first FROM driver_profiles WHERE user_id = ${dbId} LIMIT 1
    `.catch(() => []);
    if (driverRows.length && (driverRows[0] as { hmu_first?: boolean }).hmu_first) {
      return { tier: 'hmufirst', dbId };
    }
  }

  return { tier: 'standard', dbId };
}

async function getTargetUserType(targetUserId: string): Promise<string> {
  const rows = await sql`
    SELECT user_type FROM users WHERE id = ${targetUserId} LIMIT 1
  `.catch(() => []);
  return (rows[0] as { user_type?: string })?.user_type ?? 'rider';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const { success } = await ratelimit.limit(`comments-get:${clerkId}`);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { userId: targetUserId } = await params;

  if (!targetUserId) {
    return NextResponse.json({ error: 'userId param required' }, { status: 400 });
  }

  // Resolve viewer tier
  const { tier: viewerTier } = await getViewerTier(clerkId);

  // Determine target user's type to apply visibility rules
  const targetType = await getTargetUserType(targetUserId);

  // Tier-based visibility:
  // - HMU First DRIVER viewing a rider profile → can see rider comments
  // - OG RIDER viewing a driver profile → can see driver comments
  // - Standard → no comments
  const isViewingSelf = await (async () => {
    const rows = await sql`
      SELECT id FROM users WHERE auth_provider_id = ${clerkId} AND id = ${targetUserId} LIMIT 1
    `.catch(() => []);
    return rows.length > 0;
  })();

  let canViewComments = false;

  if (isViewingSelf) {
    // Users can always see their own comments
    canViewComments = true;
  } else if (viewerTier === 'hmufirst' && (targetType === 'rider' || targetType === 'both')) {
    // HMU First drivers see rider comments
    canViewComments = true;
  } else if (viewerTier === 'og' && (targetType === 'driver' || targetType === 'both')) {
    // OG riders see driver comments
    canViewComments = true;
  }

  if (!canViewComments) {
    return NextResponse.json({ comments: [] }, { status: 200 });
  }

  const comments = await sql`
    SELECT
      c.id,
      c.ride_id,
      c.text,
      c.created_at,
      c.sentiment_flags,
      u.full_name AS author_name,
      u.profile_image_url AS author_image
    FROM comments c
    JOIN users u ON u.id = c.author_id
    WHERE c.target_user_id = ${targetUserId}
      AND c.is_hidden = false
    ORDER BY c.created_at DESC
    LIMIT 50
  `.catch(() => []);

  return NextResponse.json({ comments }, { status: 200 });
}
