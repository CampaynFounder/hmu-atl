import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { updateDriverProfile } from '@/lib/db/profiles';

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length || (userRows[0] as { profile_type: string }).profile_type !== 'driver') {
    return NextResponse.json({ error: 'Driver profile required' }, { status: 403 });
  }

  const userId = (userRows[0] as { id: string }).id;

  let body: {
    accept_direct_bookings?: boolean;
    min_rider_chill_score?: number;
    require_og_status?: boolean;
    show_video_on_link?: boolean;
    profile_visible?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Update via direct SQL for fields not in updateDriverProfile
  if (body.show_video_on_link !== undefined || body.profile_visible !== undefined) {
    await sql`
      UPDATE driver_profiles SET
        show_video_on_link = COALESCE(${body.show_video_on_link ?? null}, show_video_on_link),
        profile_visible = COALESCE(${body.profile_visible ?? null}, profile_visible),
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  }

  const updated = await updateDriverProfile(userId, {
    accept_direct_bookings: body.accept_direct_bookings,
    min_rider_chill_score: body.min_rider_chill_score,
    require_og_status: body.require_og_status,
  });

  return NextResponse.json({
    acceptDirectBookings: updated.accept_direct_bookings,
    minRiderChillScore: updated.min_rider_chill_score,
    requireOgStatus: updated.require_og_status,
  });
}
