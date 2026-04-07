import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export interface PendingAction {
  id: string;
  priority: number; // 0 = highest
  type: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  color: string;
  emoji: string;
  meta?: Record<string, unknown>;
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ actions: [] });

  const userRows = await sql`
    SELECT id, profile_type, account_status, completed_rides, dispute_count, og_status
    FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ actions: [] });

  const user = userRows[0] as Record<string, unknown>;
  const userId = user.id as string;
  const profileType = user.profile_type as string;
  const actions: PendingAction[] = [];

  if (profileType === 'rider') {
    await collectRiderActions(userId, user, actions);
  } else if (profileType === 'driver') {
    await collectDriverActions(userId, user, actions);
  }

  // Sort by priority (lower = more urgent)
  actions.sort((a, b) => a.priority - b.priority);

  return NextResponse.json({ actions });
}

async function collectRiderActions(userId: string, user: Record<string, unknown>, actions: PendingAction[]) {
  // Run all queries in parallel
  const [activeRides, unratedRides, pendingBookings, draftBookings, paymentMethods, riderProfile, unreadMessages] = await Promise.all([
    // P0: Active ride needing attention
    sql`
      SELECT id, status, driver_id, coo_at,
        (SELECT display_name FROM driver_profiles WHERE user_id = r.driver_id LIMIT 1) as driver_name
      FROM rides r
      WHERE rider_id = ${userId} AND status IN ('matched','otw','here','confirming','active')
      ORDER BY created_at DESC LIMIT 1
    `,
    // P0: Ride ended, needs rating
    sql`
      SELECT r.id, r.dispute_window_expires_at,
        (SELECT display_name FROM driver_profiles WHERE user_id = r.driver_id LIMIT 1) as driver_name
      FROM rides r
      WHERE r.rider_id = ${userId} AND r.status = 'ended'
        AND NOT EXISTS (SELECT 1 FROM ratings WHERE ride_id = r.id AND rater_id = ${userId})
      ORDER BY r.ended_at DESC LIMIT 1
    `,
    // P1: Pending booking requests
    sql`
      SELECT hp.id, hp.price, hp.booking_expires_at,
        (SELECT display_name FROM driver_profiles WHERE user_id = hp.target_driver_id LIMIT 1) as driver_name
      FROM hmu_posts hp
      WHERE hp.user_id = ${userId} AND hp.post_type = 'direct_booking'
        AND hp.status = 'active' AND hp.booking_expires_at > NOW()
      ORDER BY hp.created_at DESC LIMIT 1
    `,
    // P1: Draft bookings (abandoned chat)
    sql`
      SELECT driver_handle, booking_data FROM draft_bookings
      WHERE rider_id = ${userId} AND expires_at > NOW()
      ORDER BY updated_at DESC LIMIT 1
    `,
    // P2: Payment methods
    sql`SELECT id FROM rider_payment_methods WHERE rider_id = ${userId} LIMIT 1`,
    // P2: Profile completeness
    sql`SELECT display_name, gender, first_name FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`,
    // P1: Unread chat messages
    sql`
      SELECT rm.ride_id, rm.sender_name,
        (SELECT status FROM rides WHERE id = rm.ride_id) as ride_status
      FROM ride_messages rm
      JOIN rides r ON r.id = rm.ride_id
      WHERE r.rider_id = ${userId} AND rm.sender_id != ${userId}
        AND r.status IN ('otw','here','confirming','active')
        AND rm.created_at > COALESCE(
          (SELECT MAX(created_at) FROM ride_messages WHERE ride_id = rm.ride_id AND sender_id = ${userId}),
          '1970-01-01'
        )
      ORDER BY rm.created_at DESC LIMIT 1
    `,
  ]);

  // P0: Active ride
  if (activeRides.length) {
    const ride = activeRides[0] as Record<string, unknown>;
    const needsCoo = ride.status === 'matched' && !ride.coo_at;
    actions.push({
      id: 'active_ride',
      priority: 0,
      type: 'active_ride',
      title: needsCoo ? 'Your driver is waiting' : 'Ride in progress',
      subtitle: needsCoo
        ? `Confirm your pickup with ${ride.driver_name || 'your driver'}`
        : `${ride.status === 'otw' ? 'Driver is on the way' : ride.status === 'here' ? 'Driver is here!' : 'Ride active'}`,
      cta: needsCoo ? 'Pull Up' : 'Open Ride',
      href: `/ride/${ride.id}`,
      color: '#00E676',
      emoji: needsCoo ? '\u{1F4CD}' : '\u{1F697}',
    });
  }

  // P0: Unrated ride
  if (unratedRides.length) {
    const ride = unratedRides[0] as Record<string, unknown>;
    const expiresAt = ride.dispute_window_expires_at ? new Date(ride.dispute_window_expires_at as string) : null;
    const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : null;
    actions.push({
      id: 'rate_ride',
      priority: 0,
      type: 'rate_ride',
      title: 'Rate your ride',
      subtitle: minutesLeft !== null && minutesLeft < 30
        ? `${minutesLeft} min left to rate ${ride.driver_name || 'your driver'}`
        : `How was your ride with ${ride.driver_name || 'your driver'}?`,
      cta: 'Rate Now',
      href: `/ride/${ride.id}`,
      color: '#FFD600',
      emoji: '\u2B50',
    });
  }

  // P1: Unread chat message
  if (unreadMessages.length) {
    const msg = unreadMessages[0] as Record<string, unknown>;
    actions.push({
      id: 'unread_chat',
      priority: 1,
      type: 'unread_chat',
      title: `Message from ${msg.sender_name || 'your driver'}`,
      subtitle: 'Tap to read and respond',
      cta: 'Open Chat',
      href: `/ride/${msg.ride_id}`,
      color: '#448AFF',
      emoji: '\u{1F4AC}',
    });
  }

  // P1: Continue booking (draft)
  if (draftBookings.length) {
    const draft = draftBookings[0] as Record<string, unknown>;
    const handle = draft.driver_handle as string;
    actions.push({
      id: 'continue_booking',
      priority: 1,
      type: 'continue_booking',
      title: 'Continue your booking',
      subtitle: `You started booking with @${handle}`,
      cta: 'Continue',
      href: `/d/${handle}?bookingOpen=1`,
      color: '#00E676',
      emoji: '\u{1F4DD}',
      meta: { driverHandle: handle },
    });
  }

  // P1: Pending booking
  if (pendingBookings.length) {
    const booking = pendingBookings[0] as Record<string, unknown>;
    const expiresAt = new Date(booking.booking_expires_at as string);
    const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
    actions.push({
      id: 'pending_booking',
      priority: 1,
      type: 'pending_booking',
      title: `${booking.driver_name || 'Driver'} is reviewing`,
      subtitle: `$${Number(booking.price || 0)} ride — ${minutesLeft} min left to respond`,
      cta: 'View Request',
      href: '/rider/home',
      color: '#FF9100',
      emoji: '\u{23F3}',
    });
  }

  // P2: No payment method
  if (!paymentMethods.length) {
    actions.push({
      id: 'add_payment',
      priority: 2,
      type: 'add_payment',
      title: 'Add a payment method',
      subtitle: 'Required before you can book digital rides',
      cta: 'Add Payment',
      href: '/rider/settings',
      color: '#E040FB',
      emoji: '\u{1F4B3}',
    });
  }

  // P2: Incomplete profile
  if (riderProfile.length) {
    const profile = riderProfile[0] as Record<string, unknown>;
    if (!profile.gender) {
      actions.push({
        id: 'complete_profile',
        priority: 2,
        type: 'complete_profile',
        title: 'Complete your profile',
        subtitle: 'Add your details so drivers know who they\'re picking up',
        cta: 'Update Profile',
        href: '/rider/settings',
        color: '#448AFF',
        emoji: '\u{1F464}',
      });
    }
  }

  // P3: OG status progress
  const completedRides = Number(user.completed_rides || 0);
  const disputes = Number(user.dispute_count || 0);
  if (!user.og_status && completedRides >= 5 && completedRides < 10 && disputes === 0) {
    actions.push({
      id: 'og_progress',
      priority: 3,
      type: 'og_progress',
      title: `${10 - completedRides} more rides to OG`,
      subtitle: 'OG riders see driver comments and get priority matching',
      cta: 'Find a Ride',
      href: '/rider/browse',
      color: '#FFD600',
      emoji: '\u{1F451}',
    });
  }
}

async function collectDriverActions(userId: string, user: Record<string, unknown>, actions: PendingAction[]) {
  const [activeRides, bookingRequests, driverProfile, scheduleRows, serviceRows, unreadMessages] = await Promise.all([
    // P0: Active ride
    sql`
      SELECT id, status,
        (SELECT display_name FROM rider_profiles WHERE user_id = r.rider_id LIMIT 1) as rider_name
      FROM rides r
      WHERE driver_id = ${userId} AND status IN ('matched','otw','here','confirming','active')
      ORDER BY created_at DESC LIMIT 1
    `,
    // P0: Pending booking requests
    sql`
      SELECT hp.id, hp.price, hp.booking_expires_at, hp.is_cash,
        (SELECT rp.display_name FROM rider_profiles rp WHERE rp.user_id = hp.user_id LIMIT 1) as rider_name,
        hp.time_window
      FROM hmu_posts hp
      WHERE hp.target_driver_id = ${userId} AND hp.post_type = 'direct_booking'
        AND hp.status = 'active' AND hp.booking_expires_at > NOW()
      ORDER BY hp.created_at DESC LIMIT 3
    `,
    // P1/P2: Driver profile
    sql`
      SELECT payout_setup_complete, video_url, pricing, handle, completed_rides,
        (SELECT COUNT(*) FROM rides WHERE driver_id = ${userId} AND status = 'completed')::int as total_rides
      FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
    `,
    // P2: Schedule
    sql`SELECT id FROM driver_schedules WHERE driver_id = ${userId} AND is_active = true LIMIT 1`,
    // P2: Services menu
    sql`SELECT id FROM driver_services WHERE driver_id = ${userId} AND is_active = true LIMIT 1`,
    // P1: Unread chat messages
    sql`
      SELECT rm.ride_id, rm.sender_name
      FROM ride_messages rm
      JOIN rides r ON r.id = rm.ride_id
      WHERE r.driver_id = ${userId} AND rm.sender_id != ${userId}
        AND r.status IN ('otw','here','confirming','active')
        AND rm.created_at > COALESCE(
          (SELECT MAX(created_at) FROM ride_messages WHERE ride_id = rm.ride_id AND sender_id = ${userId}),
          '1970-01-01'
        )
      ORDER BY rm.created_at DESC LIMIT 1
    `,
  ]);

  // P0: Active ride
  if (activeRides.length) {
    const ride = activeRides[0] as Record<string, unknown>;
    actions.push({
      id: 'active_ride',
      priority: 0,
      type: 'active_ride',
      title: ride.status === 'matched' ? 'New ride matched' : 'Ride in progress',
      subtitle: `${ride.rider_name || 'Rider'} — ${ride.status === 'otw' ? 'heading to pickup' : ride.status === 'here' ? 'waiting at pickup' : ride.status === 'active' ? 'ride active' : 'tap to start'}`,
      cta: 'Open Ride',
      href: `/ride/${ride.id}`,
      color: '#00E676',
      emoji: '\u{1F697}',
    });
  }

  // P0: Booking requests (show up to 3)
  for (const row of bookingRequests) {
    const req = row as Record<string, unknown>;
    const expiresAt = new Date(req.booking_expires_at as string);
    const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
    const tw = (req.time_window || {}) as Record<string, unknown>;
    actions.push({
      id: `booking_${req.id}`,
      priority: 0,
      type: 'booking_request',
      title: `${req.rider_name || 'Rider'} wants a ride`,
      subtitle: `$${Number(req.price || 0)}${req.is_cash ? ' cash' : ''} — ${tw.destination || 'ride'} — ${minutesLeft}min left`,
      cta: 'Respond',
      href: '/driver/home',
      color: '#FF9100',
      emoji: '\u{1F514}',
      meta: { postId: req.id, price: req.price, minutesLeft },
    });
  }

  // P1: Unread chat
  if (unreadMessages.length) {
    const msg = unreadMessages[0] as Record<string, unknown>;
    actions.push({
      id: 'unread_chat',
      priority: 1,
      type: 'unread_chat',
      title: `Message from ${msg.sender_name || 'rider'}`,
      subtitle: 'Tap to read and respond',
      cta: 'Open Chat',
      href: `/ride/${msg.ride_id}`,
      color: '#448AFF',
      emoji: '\u{1F4AC}',
    });
  }

  if (driverProfile.length) {
    const dp = driverProfile[0] as Record<string, unknown>;

    // P1: Payout setup
    if (!dp.payout_setup_complete) {
      actions.push({
        id: 'setup_payout',
        priority: 1,
        type: 'setup_payout',
        title: 'Link your payout',
        subtitle: 'Connect your bank or Cash App to get paid',
        cta: 'Set Up Payout',
        href: '/driver/payout-setup',
        color: '#00E676',
        emoji: '\u{1F4B0}',
      });
    }

    // P1: Share link (new driver)
    const totalRides = Number(dp.total_rides || dp.completed_rides || 0);
    if (totalRides === 0 && dp.payout_setup_complete) {
      actions.push({
        id: 'share_link',
        priority: 1,
        type: 'share_link',
        title: 'Share your HMU link',
        subtitle: 'Post it on social or send to friends to get your first ride',
        cta: 'Copy Link',
        href: '/driver/profile',
        color: '#E040FB',
        emoji: '\u{1F517}',
      });
    }

    // P2: Video intro
    if (!dp.video_url) {
      actions.push({
        id: 'add_video',
        priority: 2,
        type: 'add_video',
        title: 'Add a video intro',
        subtitle: 'Riders book 2x more with drivers who have a video',
        cta: 'Record Video',
        href: '/driver/profile',
        color: '#FF4081',
        emoji: '\u{1F3A5}',
      });
    }

    // P2: Pricing
    const pricing = dp.pricing as Record<string, unknown> | null;
    if (!pricing || !pricing.minimum) {
      actions.push({
        id: 'set_pricing',
        priority: 2,
        type: 'set_pricing',
        title: 'Set your prices',
        subtitle: 'Riders need to know your rates before booking',
        cta: 'Set Pricing',
        href: '/driver/profile',
        color: '#00E676',
        emoji: '\u{1F4B2}',
      });
    }

    // P3: HMU First upsell
    if ((user.tier as string) === 'free' && totalRides >= 5) {
      actions.push({
        id: 'hmu_first_upsell',
        priority: 3,
        type: 'hmu_first_upsell',
        title: 'Keep more of your earnings',
        subtitle: 'HMU First: 12% flat fee, instant payouts, lower caps',
        cta: 'Learn More',
        href: '/driver/profile',
        color: '#FFD600',
        emoji: '\u{1F947}',
      });
    }
  }

  // P2: Schedule
  if (!scheduleRows.length) {
    actions.push({
      id: 'set_schedule',
      priority: 2,
      type: 'set_schedule',
      title: 'Set your hours',
      subtitle: 'Let riders book you in advance',
      cta: 'Set Schedule',
      href: '/driver/schedule',
      color: '#448AFF',
      emoji: '\u{1F4C5}',
    });
  }

  // P2: Services menu
  if (!serviceRows.length) {
    actions.push({
      id: 'configure_menu',
      priority: 2,
      type: 'configure_menu',
      title: 'Configure your menu',
      subtitle: 'Add services riders can pre-order when booking',
      cta: 'Add Services',
      href: '/driver/profile',
      color: '#FF9100',
      emoji: '\u{1F4CB}',
    });
  }
}
