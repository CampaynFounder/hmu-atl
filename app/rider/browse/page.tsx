import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';
import { getPlatformConfig } from '@/lib/platform-config/get';
import {
  RIDER_BROWSE_BANNER_DEFAULTS,
  RIDER_BROWSE_BANNER_KEY,
  type RiderBrowseBannerConfig,
} from '@/lib/admin/rider-browse-banner';
import RiderBrowseClient from './rider-browse-client';

export const dynamic = 'force-dynamic';

const OG_TITLE = 'Browse Drivers — HMU ATL';
const OG_DESCRIPTION = 'Pick a driver. Send a request. Pull up. Local Atlanta drivers, your price.';
// Version param on the og:image URL so any social platform with a stuck
// cached image fetches the new one as a different entity. Bump when the
// rendering route changes substantively (template, layout, brand).
// v=3: dropped the redirect-to-/og-image.jpeg fallback that was getting
// the homepage logo permanently cached as the rider/browse OG image.
const OG_IMAGE_URL = 'https://atl.hmucashride.com/api/og/rider-browse?v=3';

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
        // Explicit type tag — FB and Slack are happier when this is
        // declared rather than inferred from Content-Type.
        type: 'image/png',
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

  const [drivers, bannerRaw] = await Promise.all([
    queryBrowseDrivers({ driverPreference }, 0, INITIAL_BATCH),
    // getPlatformConfig requires Record<string,unknown> for the merge default;
    // cast through unknown matches how other call sites in this repo handle it.
    getPlatformConfig(
      RIDER_BROWSE_BANNER_KEY,
      RIDER_BROWSE_BANNER_DEFAULTS as unknown as Record<string, unknown>,
    ),
  ]);
  const bannerConfig = bannerRaw as unknown as RiderBrowseBannerConfig;

  // Banner targets anon visitors only — once a user is signed in (rider or
  // driver) they're already in the funnel; the recruit pitch becomes noise.
  const hideBanner = !!clerkId;

  return (
    <RiderBrowseClient
      initialDrivers={drivers}
      initialBatchSize={INITIAL_BATCH}
      isAuthenticated={!!clerkId}
      bannerConfig={bannerConfig}
      hideBanner={hideBanner}
    />
  );
}
