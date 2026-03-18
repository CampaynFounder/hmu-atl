import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getDriverProfileByUserId } from '@/lib/db/profiles';
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

  return (
    <DriverProfileClient
      profile={{
        handle: (p.handle as string) || '',
        displayName: (p.display_name as string) || (p.first_name as string) || '',
        firstName: (p.first_name as string) || '',
        lastName: (p.last_name as string) || '',
        gender: (p.gender as string) || '',
        pronouns: (p.pronouns as string) || '',
        lgbtqFriendly: (p.lgbtq_friendly as boolean) || false,
        areas: Array.isArray(p.areas) ? p.areas : [],
        pricing: (p.pricing as Record<string, unknown>) || {},
        schedule: (p.schedule as Record<string, unknown>) || {},
        vehiclePhotoUrl: ((p.vehicle_info as Record<string, unknown>)?.photo_url as string) || '',
        acceptDirectBookings: (p.accept_direct_bookings as boolean) ?? true,
        minRiderChillScore: Number(p.min_rider_chill_score ?? 0),
        requireOgStatus: (p.require_og_status as boolean) || false,
      }}
      user={{
        tier: user.tier,
        chillScore: Number(user.chill_score ?? 0),
        completedRides: Number(user.completed_rides ?? 0),
      }}
    />
  );
}
