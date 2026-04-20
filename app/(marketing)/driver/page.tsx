import { headers } from 'next/headers';
import type { Metadata } from 'next';
import DriverLandingClient from './driver-landing-client';
import { getPageContent } from '@/lib/cms/queries';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  const canonical = `https://${brand.host}/driver`;
  return {
    title: 'HMU Cash Ride — Make Bank Trips not Blank Trips | Driver Sign Up',
    description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Set your price. Get paid before you go. Sign up free.',
    alternates: { canonical },
    openGraph: {
      title: 'HMU Cash Ride — Make Bank Trips not Blank Trips',
      description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Set your price. Get paid before you go. Sign up free.',
      url: canonical,
      siteName: 'HMUCASHRIDE',
      locale: 'en_US',
      type: 'website',
      images: [{ url: brand.ogImage, width: 1200, height: 630, alt: 'HMU Cash Ride - Make Bank Trips not Blank Trips' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'HMU Cash Ride — Make Bank Trips not Blank Trips',
      description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Sign up free.',
      images: [brand.ogImage],
    },
  };
}

export default async function DriverLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [params, h] = await Promise.all([searchParams, headers()]);
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  const utmFunnel = typeof params.utm_funnel === 'string' ? params.utm_funnel : undefined;
  const utmSource = typeof params.utm_source === 'string' ? params.utm_source : undefined;
  const utmCampaign = typeof params.utm_campaign === 'string' ? params.utm_campaign : undefined;
  const utmPersona = typeof params.utm_persona === 'string' ? params.utm_persona : undefined;

  const { content, flags, sectionOrder, funnelStage } = await getPageContent(
    'driver_landing', brand.slug,
    { utm_funnel: utmFunnel, utm_source: utmSource, utm_campaign: utmCampaign, utm_persona: utmPersona },
  );
  return (
    <DriverLandingClient
      initialContent={content}
      initialFlags={flags}
      sectionOrder={sectionOrder}
      funnelStage={funnelStage}
    />
  );
}
