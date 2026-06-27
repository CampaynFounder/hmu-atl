import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

// GET /api/driver/profile — full self-serve profile for the authenticated driver
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`
      SELECT
        u.id,
        u.tier,
        u.chill_score,
        u.completed_rides,
        dp.handle,
        dp.display_name,
        dp.first_name,
        dp.last_name,
        dp.phone,
        dp.gender,
        dp.pronouns,
        dp.lgbtq_friendly,
        dp.areas,
        dp.area_slugs,
        dp.services_entire_market,
        dp.accepts_long_distance,
        dp.pricing,
        dp.vehicle_info,
        dp.video_url,
        dp.vibe_video_url,
        dp.thumbnail_url,
        dp.accept_direct_bookings,
        dp.min_rider_chill_score,
        dp.require_og_status,
        dp.show_video_on_link,
        dp.profile_visible,
        dp.fwu,
        dp.accepts_cash,
        dp.cash_only,
        dp.allow_in_route_stops,
        dp.wait_minutes,
        dp.advance_notice_hours,
        dp.deposit_floor,
        dp.accepts_down_bad,
        dp.payout_setup_complete,
        dp.stripe_external_account_last4,
        dp.stripe_external_account_type,
        dp.stripe_external_account_bank
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId}
      LIMIT 1
    `;

    if (!rows.length) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const r = rows[0] as Record<string, unknown>;
    const vi = (r.vehicle_info as Record<string, unknown>) || {};

    return NextResponse.json({
      id: r.id,
      handle: r.handle,
      displayName: (r.display_name as string) || (r.first_name as string) || '',
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      gender: r.gender,
      pronouns: r.pronouns,
      lgbtqFriendly: r.lgbtq_friendly ?? false,
      areas: Array.isArray(r.areas) ? r.areas : [],
      areaSlugs: Array.isArray(r.area_slugs) ? r.area_slugs : [],
      servicesEntireMarket: r.services_entire_market ?? false,
      acceptsLongDistance: r.accepts_long_distance ?? false,
      pricing: r.pricing ?? {},
      vehicleInfo: {
        licensePlate: (vi.license_plate as string) || '',
        plateState: (vi.plate_state as string) || 'GA',
        vehicleMpg: vi.vehicle_mpg != null ? Number(vi.vehicle_mpg) : null,
        photoUrl: (vi.photo_url as string) || null,
      },
      // Profile media (Media & Video screen): intro video, Vibe reel, cover photo.
      // Cover photo is written to both vehicle_info.photo_url and thumbnail_url by
      // the uploader, so fall back between them.
      media: {
        videoUrl: (r.video_url as string) || null,
        vibeVideoUrl: (r.vibe_video_url as string) || null,
        coverPhotoUrl: (vi.photo_url as string) || (r.thumbnail_url as string) || null,
      },
      acceptDirectBookings: r.accept_direct_bookings ?? true,
      minRiderChillScore: Number(r.min_rider_chill_score ?? 0),
      requireOgStatus: r.require_og_status ?? false,
      showVideoOnLink: r.show_video_on_link ?? true,
      profileVisible: r.profile_visible ?? true,
      fwu: r.fwu ?? false,
      acceptsCash: r.accepts_cash ?? false,
      cashOnly: r.cash_only ?? false,
      allowInRouteStops: r.allow_in_route_stops ?? true,
      waitMinutes: Number(r.wait_minutes ?? 10),
      advanceNoticeHours: Number(r.advance_notice_hours ?? 0),
      depositFloor: r.deposit_floor != null ? Number(r.deposit_floor) : null,
      acceptsDownBad: r.accepts_down_bad ?? false,
      tier: r.tier,
      chillScore: Number(r.chill_score ?? 0),
      completedRides: Number(r.completed_rides ?? 0),
      payout: {
        setupComplete: !!(r.payout_setup_complete),
        last4: (r.stripe_external_account_last4 as string) || null,
        accountType: (r.stripe_external_account_type as string) || null,
        bankName: (r.stripe_external_account_bank as string) || null,
      },
    });
  } catch (error) {
    console.error('GET /api/driver/profile error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/driver/profile — update identity fields (display name, phone, gender)
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const body = await req.json() as {
      displayName?: string;
      phone?: string;
      gender?: string;
      pronouns?: string;
      // Clear a piece of profile media (Media & Video CRUD on mobile/web).
      clearMedia?: 'video' | 'vibe' | 'cover';
    };

    // Explicit media removal — COALESCE can't set NULL, so handle it directly.
    if (body.clearMedia) {
      if (body.clearMedia === 'video') {
        await sql`UPDATE driver_profiles SET video_url = NULL, updated_at = NOW() WHERE user_id = ${userId}`;
      } else if (body.clearMedia === 'vibe') {
        await sql`UPDATE driver_profiles SET vibe_video_url = NULL, updated_at = NOW() WHERE user_id = ${userId}`;
      } else if (body.clearMedia === 'cover') {
        // Cover lives in both thumbnail_url and vehicle_info.photo_url.
        await sql`
          UPDATE driver_profiles
          SET thumbnail_url = NULL,
              vehicle_info = COALESCE(vehicle_info, '{}'::jsonb) - 'photo_url',
              updated_at = NOW()
          WHERE user_id = ${userId}
        `;
      }
      return NextResponse.json({ ok: true });
    }

    await sql`
      UPDATE driver_profiles SET
        display_name = COALESCE(${body.displayName ?? null}, display_name),
        phone        = COALESCE(${body.phone ?? null}, phone),
        gender       = COALESCE(${body.gender ?? null}, gender),
        pronouns     = COALESCE(${body.pronouns ?? null}, pronouns),
        updated_at   = NOW()
      WHERE user_id = ${userId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/driver/profile error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
