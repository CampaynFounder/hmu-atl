import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';
import RiderBrowseClient from './rider-browse-client';

export const dynamic = 'force-dynamic';

const OG_TITLE = 'Browse Drivers — HMU ATL';
const OG_DESCRIPTION = 'Pick a driver. Send a request. Pull up. Local Atlanta drivers, your price.';
const OG_IMAGE_URL = 'https://atl.hmucashride.com/api/og/rider-browse';

export const metadata: Metadata = {
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: 'https://atl.hmucashride.com/rider/browse',
    siteName: 'HMU ATL',
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: 'Browse drivers on HMU ATL',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
};

// Server pre-renders the first N cards so the page is usable before JS hydrates;
// the client pages the rest via /api/rider/browse/list (same query helper).
const INITIAL_BATCH = 12;

export default async function RiderBrowsePage() {
  const { userId: clerkId } = await auth();

  // Anon viewers get the page with default preference (no rider_profiles row
  // to read). The drawer routes them through draft-then-auth on submit.
  let driverPreference: string | null = null;
  if (clerkId) {
    const riderRows = await sql`
      SELECT rp.driver_preference
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.clerk_id = ${clerkId}
      LIMIT 1
    `;
    driverPreference = (riderRows[0]?.driver_preference as string | null) ?? null;
  }

  const drivers = await queryBrowseDrivers({ driverPreference }, 0, INITIAL_BATCH);

  return (
    <RiderBrowseClient
      initialDrivers={drivers}
      initialBatchSize={INITIAL_BATCH}
      isAuthenticated={!!clerkId}
    />
  );
}
