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
    phone?: string;
    license_plate?: string;
    plate_state?: string;
    accepts_cash?: boolean;
    cash_only?: boolean;
    allow_in_route_stops?: boolean;
    wait_minutes?: number;
    advance_notice_hours?: number;
    /** Driver's deposit floor (deposit_only pricing mode). NULL clears it. */
    deposit_floor?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Save phone number
  if (body.phone !== undefined) {
    await sql`
      UPDATE driver_profiles SET phone = ${body.phone}, updated_at = NOW()
      WHERE user_id = ${userId}
    `;
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

  // Driver-set deposit floor (deposit_only pricing mode). The strategy clamps
  // to the admin band in pricing_modes.config; we save whatever the driver
  // typed (validated only as non-negative number-or-null here).
  if (body.deposit_floor !== undefined) {
    if (body.deposit_floor !== null && (typeof body.deposit_floor !== 'number' || body.deposit_floor < 0)) {
      return NextResponse.json({ error: 'deposit_floor must be a non-negative number or null' }, { status: 400 });
    }
    await sql`
      UPDATE driver_profiles SET
        deposit_floor = ${body.deposit_floor},
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  }

  // Cash mode + wait time + in-route stops settings
  if (body.accepts_cash !== undefined || body.cash_only !== undefined || body.wait_minutes !== undefined || body.advance_notice_hours !== undefined || body.allow_in_route_stops !== undefined) {
    await sql`
      UPDATE driver_profiles SET
        accepts_cash = COALESCE(${body.accepts_cash ?? null}, accepts_cash),
        cash_only = COALESCE(${body.cash_only ?? null}, cash_only),
        allow_in_route_stops = COALESCE(${body.allow_in_route_stops ?? null}, allow_in_route_stops),
        wait_minutes = COALESCE(${body.wait_minutes ?? null}, wait_minutes),
        advance_notice_hours = COALESCE(${body.advance_notice_hours ?? null}, advance_notice_hours),
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

  // Fetch current state so response reflects all saved fields
  const current = await sql`
    SELECT accept_direct_bookings, min_rider_chill_score, require_og_status,
           show_video_on_link, profile_visible, fwu, accepts_cash, cash_only,
           allow_in_route_stops, wait_minutes, advance_notice_hours, phone,
           deposit_floor
    FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  const row = (current[0] || updated) as Record<string, unknown>;

  return NextResponse.json({
    acceptDirectBookings: row.accept_direct_bookings,
    minRiderChillScore: row.min_rider_chill_score,
    requireOgStatus: row.require_og_status,
    showVideoOnLink: row.show_video_on_link,
    profileVisible: row.profile_visible,
    fwu: row.fwu,
    acceptsCash: row.accepts_cash,
    cashOnly: row.cash_only,
    allowInRouteStops: row.allow_in_route_stops,
    waitMinutes: row.wait_minutes,
    advanceNoticeHours: row.advance_notice_hours,
    phone: row.phone,
    depositFloor: row.deposit_floor != null ? Number(row.deposit_floor) : null,
  });
}
