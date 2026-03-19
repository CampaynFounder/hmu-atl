import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import RiderHomeClient from './rider-home-client';
import RiderFeedClient from './rider-feed-client';

export const metadata = {
  title: 'Find a Ride — HMU ATL',
  description: 'Skip Uber fees. Book local ATL drivers at your price. Safe, rated, payment-ready rides.',
};

export default async function RiderHomePage() {
  // Check if user is logged in
  let isLoggedIn = false;
  let displayName = '';
  try {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const rows = await sql`
        SELECT u.profile_type, rp.display_name, rp.first_name
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.clerk_id = ${clerkId} LIMIT 1
      `;
      if (rows.length) {
        const user = rows[0] as Record<string, unknown>;
        if (user.profile_type === 'rider') {
          isLoggedIn = true;
          displayName = (user.display_name as string) || 'Rider';
        }
      }
    }
  } catch {
    // Not logged in — show marketing page
  }

  if (isLoggedIn) {
    return <RiderFeedClient displayName={displayName} />;
  }

  return <RiderHomeClient />;
}
