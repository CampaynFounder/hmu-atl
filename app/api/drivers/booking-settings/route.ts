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
    fwu?: boolean;
    license_plate?: string;
    plate_state?: string;
    accepts_cash?: boolean;
    cash_only?: boolean;
    wait_minutes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Update via direct SQL for fields not in updateDriverProfile
  // Save license plate to vehicle_info JSONB
  if (body.license_plate !== undefined) {
    await sql`
      UPDATE driver_profiles SET
        vehicle_info = jsonb_set(
          jsonb_set(COALESCE(vehicle_info, '{}')::jsonb, '{license_plate}', ${JSON.stringify(body.license_plate)}::jsonb),
          '{plate_state}', ${JSON.stringify(body.plate_state || 'GA')}::jsonb
        ),
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  }

  // Cash mode + wait time settings
  if (body.accepts_cash !== undefined || body.cash_only !== undefined || body.wait_minutes !== undefined) {
    await sql`
      UPDATE driver_profiles SET
        accepts_cash = COALESCE(${body.accepts_cash ?? null}, accepts_cash),
        cash_only = COALESCE(${body.cash_only ?? null}, cash_only),
        wait_minutes = COALESCE(${body.wait_minutes ?? null}, wait_minutes),
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  }

  if (body.show_video_on_link !== undefined || body.profile_visible !== undefined || body.fwu !== undefined) {
    await sql`
      UPDATE driver_profiles SET
        show_video_on_link = COALESCE(${body.show_video_on_link ?? null}, show_video_on_link),
        profile_visible = COALESCE(${body.profile_visible ?? null}, profile_visible),
        fwu = COALESCE(${body.fwu ?? null}, fwu),
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
