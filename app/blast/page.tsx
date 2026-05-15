// /blast — public social-proof landing for the Blast funnel.
// Stream A (per docs/BLAST-V3-AGENT-CONTRACT.md §4 + §5.1 + §5.5 + §6.6).
//
// Pre-auth, market-default driver grid. No HMU button on cards (this surface
// is showroom, not booking). Single sticky bottom CTA → /rider/blast/new.

import type { Metadata } from 'next';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { notFound } from 'next/navigation';
import BlastSocialProofClient from './blast-social-proof-client';

export const dynamic = 'force-dynamic';

const OG_TITLE = 'Get a Ride — HMU ATL';
const OG_DESCRIPTION = 'Tell us where you\'re headed. Drivers HMU back. You pick.';
const OG_IMAGE_URL = 'https://atl.hmucashride.com/og-rider-browse.jpg?v=4';

export const metadata: Metadata = {
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: 'https://atl.hmucashride.com/blast',
    siteName: 'HMU ATL',
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, type: 'image/jpeg' }],
    type: 'website',
  },
};

const INITIAL_BATCH = 24;

export default async function BlastLandingPage() {
  // Feature flag the surface; same flag gates the form on submit.
  if (!(await isFeatureEnabled('blast_booking'))) notFound();

  // Public, unscoped — anyone can see the social-proof grid before auth.
  // No driver_preference filter at this stage; the personalization happens
  // post-auth on /rider/browse.
  const drivers = await queryBrowseDrivers({ driverPreference: null }, 0, INITIAL_BATCH);

  return <BlastSocialProofClient initialDrivers={drivers} />;
}
