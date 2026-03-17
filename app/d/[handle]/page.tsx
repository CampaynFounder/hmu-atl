import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getDriverProfileByHandle } from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';
import DriverShareProfileClient from './driver-share-profile-client';

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ bookingOpen?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getDriverProfileByHandle(handle);
  if (!profile) return { title: 'Driver not found — HMU ATL' };

  const name = profile.first_name;
  const areas = Array.isArray(profile.areas) ? profile.areas.join(', ') : '';

  return {
    title: `Book ${name} — HMU ATL`,
    description: `Book ${name} directly on HMU ATL. Serving ${areas}. Payment secured upfront.`,
    openGraph: {
      title: `Book ${name} on HMU ATL`,
      description: `${areas} • Payment-ready rides in Metro ATL`,
      url: `https://atl.hmucashride.com/d/${handle}`,
      siteName: 'HMU ATL Cash Ride',
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Book ${name} — HMU ATL`,
      description: `${areas} • Payment secured before they pull up.`,
    },
  };
}

export default async function DriverSharePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { bookingOpen } = await searchParams;

  const profile = await getDriverProfileByHandle(handle);
  if (!profile) notFound();

  // Fetch user-level data (tier, chill_score, completed_rides, account_status)
  const userRows = await sql`
    SELECT tier, chill_score, completed_rides, account_status
    FROM users WHERE id = ${profile.user_id} LIMIT 1
  `;

  if (!userRows.length || (userRows[0] as { account_status: string }).account_status !== 'active') {
    notFound();
  }

  const user = userRows[0] as {
    tier: string;
    chill_score: number;
    completed_rides: number;
    account_status: string;
  };

  const driverData = {
    handle: profile.handle!,
    displayName: profile.first_name,
    areas: Array.isArray(profile.areas) ? profile.areas : [],
    pricing: profile.pricing as Record<string, unknown>,
    schedule: profile.schedule as Record<string, unknown>,
    vehiclePhotoUrl: (profile.vehicle_info as Record<string, unknown>)?.photo_url as string | null ?? null,
    isHmuFirst: user.tier === 'hmu_first',
    chillScore: Number(user.chill_score),
    completedRides: Number(user.completed_rides ?? 0),
    acceptDirectBookings: profile.accept_direct_bookings,
    minRiderChillScore: Number(profile.min_rider_chill_score),
    requireOgStatus: profile.require_og_status,
  };

  return (
    <DriverShareProfileClient
      driver={driverData}
      autoOpenBooking={bookingOpen === '1'}
    />
  );
}
