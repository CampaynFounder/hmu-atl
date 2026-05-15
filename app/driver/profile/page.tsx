import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getDriverProfileByUserId } from '@/lib/db/profiles';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { getMarketAreas } from '@/lib/markets/areas';
import { driverAllowsCashOnly } from '@/lib/payments/strategies';
import DriverProfileClient from './driver-profile-client';

export default async function DriverProfilePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`
    SELECT id, tier, chill_score, completed_rides
    FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) redirect('/onboarding?type=driver');

  const user = userRows[0] as {
    id: string;
    tier: string;
    chill_score: number;
    completed_rides: number;
  };

  const profile = await getDriverProfileByUserId(user.id);
  if (!profile) redirect('/onboarding?type=driver');

  const p = profile as unknown as Record<string, unknown>;
  const market = await resolveMarketForUser(user.id);
  const marketAreas = await getMarketAreas(market.market_id);
  const cashAllowed = await driverAllowsCashOnly(user.id);

  return (
    <DriverProfileClient
      profile={{
        handle: (p.handle as string) || '',
        displayName: (p.display_name as string) || (p.first_name as string) || '',
        firstName: (p.first_name as string) || '',
        lastName: (p.last_name as string) || '',
        phone: (p.phone as string) || '',
        gender: (p.gender as string) || '',
        pronouns: (p.pronouns as string) || '',
        lgbtqFriendly: (p.lgbtq_friendly as boolean) || false,
        areas: Array.isArray(p.areas) ? p.areas : [],
        areaSlugs: Array.isArray(p.area_slugs) ? (p.area_slugs as string[]) : [],
        servicesEntireMarket: (p.services_entire_market as boolean) || false,
        acceptsLongDistance: (p.accepts_long_distance as boolean) || false,
        pricing: (p.pricing as Record<string, unknown>) || {},
        schedule: (p.schedule as Record<string, unknown>) || {},
        videoUrl: (p.video_url as string) || '',
        vibeVideoUrl: (p.vibe_video_url as string) || '',
        vehiclePhotoUrl: ((p.vehicle_info as Record<string, unknown>)?.photo_url as string) || '',
        licensePlate: ((p.vehicle_info as Record<string, unknown>)?.license_plate as string) || '',
        plateState: ((p.vehicle_info as Record<string, unknown>)?.plate_state as string) || 'GA',
        acceptDirectBookings: (p.accept_direct_bookings as boolean) ?? true,
        minRiderChillScore: Number(p.min_rider_chill_score ?? 0),
        requireOgStatus: (p.require_og_status as boolean) || false,
        showVideoOnLink: (p.show_video_on_link as boolean) ?? true,
        profileVisible: (p.profile_visible as boolean) ?? true,
        fwu: (p.fwu as boolean) || false,
        acceptsCash: (p.accepts_cash as boolean) || false,
        cashOnly: (p.cash_only as boolean) || false,
        allowInRouteStops: (p.allow_in_route_stops as boolean) ?? true,
        waitMinutes: Number((p as Record<string, unknown>).wait_minutes ?? 10),
        advanceNoticeHours: Number((p as Record<string, unknown>).advance_notice_hours ?? 0),
        depositFloor: (p as Record<string, unknown>).deposit_floor != null ? Number((p as Record<string, unknown>).deposit_floor) : null,
        homeLat: p.home_lat != null ? Number(p.home_lat) : null,
        homeLng: p.home_lng != null ? Number(p.home_lng) : null,
        homeLabel: (p.home_label as string) || null,
        homeMapboxId: (p.home_mapbox_id as string) || null,
      }}
      user={{
        tier: user.tier,
        chillScore: Number(user.chill_score ?? 0),
        completedRides: Number(user.completed_rides ?? 0),
      }}
      payout={{
        setupComplete: !!(p.payout_setup_complete),
        last4: (p.stripe_external_account_last4 as string) || null,
        accountType: (p.stripe_external_account_type as string) || null,
        bankName: (p.stripe_external_account_bank as string) || null,
      }}
      subscription={{
        status: (p.subscription_status as string) || null,
        subscriptionId: (p.stripe_subscription_id as string) || null,
      }}
      market={{ slug: market.slug, name: market.name }}
      marketAreas={marketAreas.map(a => ({
        slug: a.slug,
        name: a.name,
        cardinal: a.cardinal,
      }))}
      cashAllowed={cashAllowed}
    />
  );
}
