// POST /api/rider/down-bad — create a Down Bad post (post_type = 'down_bad')
//
// Required body:
//   pickup_lat, pickup_lng, pickup_address  — pickup location
//   dropoff_lat, dropoff_lng, dropoff_address — dropoff location
//   price          — cash deposit rider is offering (dollars, integer)
//   sum_extra_text — rider's description of the sum extra ("10pc wing combo")
//   sum_extra_media_url  — R2 URL of the required photo/video
//   sum_extra_media_type — 'photo' | 'video'
//   sum_extra_poster_url — optional; R2 URL of video poster frame
//   scheduled_for  — ISO timestamp or null (null = ASAP)
//
// Card gate: deposit is held at Pull Up, not here. No card check at creation.
// Quality gates: feature flag, account_status, no active ride, cash range, min rides/chill.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getPlatformConfig } from '@/lib/platform-config/get';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { publishToChannel } from '@/lib/ably/server';
import { notifyDriverDownBadPosted } from '@/lib/sms/textbee';

interface DownBadConfig {
  enabled: boolean;
  cash_floor_cents: number;
  cash_ceiling_cents: number;
  sum_extra_max_chars: number;
  require_min_rides: number;
  require_min_chill_score: number;
  expiry_hours: number;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    pickup_lat?: number;
    pickup_lng?: number;
    pickup_address?: string;
    dropoff_lat?: number;
    dropoff_lng?: number;
    dropoff_address?: string;
    price?: number;
    sum_extra_text?: string;
    sum_extra_media_url?: string;
    sum_extra_media_type?: 'photo' | 'video';
    sum_extra_poster_url?: string | null;
    scheduled_for?: string | null;
    target_driver_handle?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Validate required fields ───────────────────────────────────────────────
  const { pickup_lat, pickup_lng, pickup_address,
          dropoff_lat, dropoff_lng, dropoff_address,
          price, sum_extra_text, sum_extra_media_url, sum_extra_media_type,
          sum_extra_poster_url, scheduled_for, target_driver_handle } = body;

  if (!pickup_lat || !pickup_lng || !pickup_address) {
    return NextResponse.json({ error: 'Pickup location required' }, { status: 400 });
  }
  if (!dropoff_lat || !dropoff_lng || !dropoff_address) {
    return NextResponse.json({ error: 'Dropoff location required' }, { status: 400 });
  }
  if (!price || price < 1) {
    return NextResponse.json({ error: 'Deposit amount required ($1 minimum)' }, { status: 400 });
  }
  if (!sum_extra_text?.trim()) {
    return NextResponse.json({ error: 'Sum extra description required' }, { status: 400 });
  }
  if (!sum_extra_media_url) {
    return NextResponse.json({ error: 'Sum extra photo or video required' }, { status: 400 });
  }
  if (!sum_extra_media_type || !['photo', 'video'].includes(sum_extra_media_type)) {
    return NextResponse.json({ error: "sum_extra_media_type must be 'photo' or 'video'" }, { status: 400 });
  }

  // ── Fetch rider + config in parallel ──────────────────────────────────────
  const [userRows, rawConfig] = await Promise.all([
    sql`
      SELECT u.id, u.account_status, u.completed_rides, u.chill_score
      FROM users u
      WHERE u.clerk_id = ${clerkId}
      LIMIT 1
    `,
    getPlatformConfig('down_bad.config', {
      enabled: false,
      cash_floor_cents: 500,
      cash_ceiling_cents: 3000,
      sum_extra_max_chars: 120,
      require_min_rides: 0,
      require_min_chill_score: 0,
      expiry_hours: 4,
    } as Record<string, unknown>),
  ]);

  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const config = rawConfig as unknown as DownBadConfig;
  const rider = userRows[0] as {
    id: string;
    account_status: string;
    completed_rides: number;
    chill_score: number;
  };

  // ── Feature + account gates ────────────────────────────────────────────────
  if (!config.enabled) {
    return NextResponse.json({ error: 'Down Bad is not available yet', code: 'feature_disabled' }, { status: 403 });
  }
  if (rider.account_status !== 'active') {
    return NextResponse.json({ error: 'Account must be active to post', code: 'account_inactive' }, { status: 403 });
  }

  // ── Quality gates ──────────────────────────────────────────────────────────
  const priceCents = Math.round(price * 100);
  if (priceCents < config.cash_floor_cents) {
    return NextResponse.json({
      error: `Minimum deposit is $${(config.cash_floor_cents / 100).toFixed(0)}`,
      code: 'below_floor',
    }, { status: 422 });
  }
  if (priceCents > config.cash_ceiling_cents) {
    return NextResponse.json({
      error: `Maximum deposit is $${(config.cash_ceiling_cents / 100).toFixed(0)}`,
      code: 'above_ceiling',
    }, { status: 422 });
  }
  if (sum_extra_text.trim().length > config.sum_extra_max_chars) {
    return NextResponse.json({
      error: `Sum extra description max ${config.sum_extra_max_chars} characters`,
      code: 'text_too_long',
    }, { status: 422 });
  }
  if (config.require_min_rides > 0 && rider.completed_rides < config.require_min_rides) {
    return NextResponse.json({
      error: `You need at least ${config.require_min_rides} completed rides to post Down Bad`,
      code: 'insufficient_rides',
    }, { status: 403 });
  }
  if (config.require_min_chill_score > 0 && rider.chill_score < config.require_min_chill_score) {
    return NextResponse.json({
      error: 'Your Chill Score is too low to post Down Bad',
      code: 'low_chill_score',
    }, { status: 403 });
  }

  // ── Active ride block ──────────────────────────────────────────────────────
  const activeRides = await sql`
    SELECT id FROM rides WHERE rider_id = ${rider.id}
    AND status IN ('otw', 'here', 'active') LIMIT 1
  `;
  if (activeRides.length) {
    return NextResponse.json({ error: 'You have an active ride in progress', code: 'active_ride' }, { status: 409 });
  }

  // ── Target driver (optional — from driver profile "Send Down Bad Offer" CTA) ──
  let targetDriverId: string | null = null;
  if (target_driver_handle) {
    const tdRows = await sql`
      SELECT dp.user_id FROM driver_profiles dp
      WHERE dp.handle = ${target_driver_handle}
        AND dp.accepts_down_bad = true
      LIMIT 1
    `;
    targetDriverId = tdRows.length ? (tdRows[0] as { user_id: string }).user_id : null;
  }

  // ── Resolve market ─────────────────────────────────────────────────────────
  let market: Awaited<ReturnType<typeof resolveMarketForUser>>;
  try {
    market = await resolveMarketForUser(rider.id);
  } catch {
    return NextResponse.json({ error: 'No live market available. Try again later.', code: 'no_market' }, { status: 503 });
  }

  // Cancel any existing active Down Bad post for this rider (one at a time)
  await sql`
    UPDATE hmu_posts SET status = 'cancelled'
    WHERE user_id = ${rider.id}
      AND post_type = 'down_bad'
      AND status = 'active'
  `;

  const expiresAt = new Date(Date.now() + config.expiry_hours * 3_600_000);

  // ── Insert ─────────────────────────────────────────────────────────────────
  try {
    const rows = await sql`
      INSERT INTO hmu_posts (
        user_id, post_type, market_id, status,
        pickup_lat, pickup_lng, pickup_address,
        dropoff_lat, dropoff_lng, dropoff_address,
        price, scheduled_for, expires_at, areas,
        time_window,
        sum_extra_text, sum_extra_media_url, sum_extra_media_type,
        target_driver_id
      ) VALUES (
        ${rider.id}, 'down_bad', ${market.market_id}, 'active',
        ${pickup_lat}, ${pickup_lng}, ${pickup_address},
        ${dropoff_lat}, ${dropoff_lng}, ${dropoff_address},
        ${price}, ${scheduled_for ?? null}, ${expiresAt},
        ${[market.slug.toUpperCase()]},
        ${'{}'},
        ${sum_extra_text.trim()},
        ${sum_extra_media_url},
        ${sum_extra_media_type},
        ${targetDriverId}
      )
      RETURNING id
    `;

    const postId = (rows[0] as { id: string }).id;

    publishToChannel(`market:${market.slug}:down-bad`, 'down_bad_posted', {
      postId, price,
      mediaType: sum_extra_media_type,
      posterUrl: sum_extra_poster_url ?? null,
      pickupAddress: pickup_address,
      dropoffAddress: dropoff_address,
    }).catch(() => {});

    // SMS all opted-in drivers in this market (fire-and-forget)
    sql`
      SELECT dp.phone
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.accepts_down_bad = true
        AND dp.phone IS NOT NULL
        AND length(dp.phone) >= 10
        AND u.account_status = 'active'
        AND u.market_id = ${market.market_id}
      LIMIT 15
    `.then((driverRows: unknown[]) => {
      for (const row of driverRows) {
        const phone = (row as { phone: string }).phone;
        notifyDriverDownBadPosted(phone, price, { market: market.slug }).catch(() => {});
      }
    }).catch(() => {});

    return NextResponse.json({ postId, expiresAt: expiresAt.toISOString() }, { status: 201 });
  } catch (err) {
    console.error('down-bad insert failed:', err);
    return NextResponse.json({ error: 'Failed to create post. Try again.' }, { status: 500 });
  }
}
