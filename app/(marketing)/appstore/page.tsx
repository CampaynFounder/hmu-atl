import { headers } from 'next/headers';
import type { Metadata } from 'next';
import AppstoreLandingClient from './appstore-landing-client';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';
import { MAX_SAVINGS_PCT, RIDES_COMPLETED_LABEL } from '@/lib/marketing/stats';

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  const canonical = `https://${brand.host}/appstore`;
  const title = `Download the HMU Cash Ride App — iOS & Android | ${brand.city}`;
  const description = `Get the HMU Cash Ride app for iPhone and Android. Metro ${brand.city}'s peer-to-peer cash ride platform — rides up to ${MAX_SAVINGS_PCT}% cheaper than Uber, pay with Cash App, Venmo, Zelle or cash. ${RIDES_COMPLETED_LABEL} rides completed. Download free.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `Download HMU Cash Ride — iOS & Android`,
      description: `Metro ${brand.city}'s peer-to-peer cash ride app. Cheaper rides, real local drivers, pay your way. Download free.`,
      url: canonical,
      siteName: 'HMUCASHRIDE',
      locale: 'en_US',
      type: 'website',
      images: [{ url: brand.ogImage, width: 1200, height: 630, alt: 'Download the HMU Cash Ride app' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Download HMU Cash Ride — iOS & Android`,
      description: `Cheaper rides, real local drivers, pay your way. Download free.`,
      images: [brand.ogImage],
    },
  };
}

export default async function AppstoreLandingPage() {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  return <AppstoreLandingClient brandCity={brand.city} brandLabel={`HMU ${brand.cityShort}`} />;
}
