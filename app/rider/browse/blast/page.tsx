// /rider/browse/blast — public read-only driver grid + "Find a Ride" CTA.
// Spec §3.1. Unauthenticated visitors are welcome; the auth gate is at
// "Send to Drivers" tap on the form (/rider/blast/new).

import type { Metadata } from 'next';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { notFound } from 'next/navigation';
import BlastBrowseClient from './blast-browse-client';

export const dynamic = 'force-dynamic';

const OG_TITLE = 'Find a Ride — HMU ATL';
const OG_DESCRIPTION = 'Tell us where you\'re headed. Drivers HMU back. You pick.';
const OG_IMAGE_URL = 'https://atl.hmucashride.com/og-rider-browse.jpg?v=4';

export const metadata: Metadata = {
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: 'https://atl.hmucashride.com/rider/browse/blast',
    siteName: 'HMU ATL',
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, type: 'image/jpeg' }],
    type: 'website',
  },
};

const INITIAL_BATCH = 24;

export default async function RiderBrowseBlastPage() {
  if (!(await isFeatureEnabled('blast_booking'))) {
    notFound();
  }

  // Public, unscoped — anyone can see the social-proof grid before auth.
  const drivers = await queryBrowseDrivers({ driverPreference: null }, 0, INITIAL_BATCH);

  return <BlastBrowseClient initialDrivers={drivers} />;
}
