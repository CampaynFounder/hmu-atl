import DriverLandingClient from './driver-landing-client';
import { getPageContent } from '@/lib/cms/queries';

export const metadata = {
  title: 'HMU Cash Ride — Make Bank Trips not Blank Trips | Driver Sign Up',
  description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Set your price. Get paid before you go. Sign up free.',
  alternates: {
    canonical: 'https://atl.hmucashride.com/driver',
  },
  openGraph: {
    title: 'HMU Cash Ride — Make Bank Trips not Blank Trips',
    description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Set your price. Get paid before you go. Sign up free.',
    url: 'https://atl.hmucashride.com/driver',
    siteName: 'HMUCASHRIDE',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://atl.hmucashride.com/og-image.jpeg', width: 1200, height: 630, alt: 'HMU Cash Ride - Make Bank Trips not Blank Trips' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HMU Cash Ride — Make Bank Trips not Blank Trips',
    description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Sign up free.',
    images: ['https://atl.hmucashride.com/og-image.jpeg'],
  },
};

export default async function DriverLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const utmFunnel = typeof params.utm_funnel === 'string' ? params.utm_funnel : undefined;
  const utmSource = typeof params.utm_source === 'string' ? params.utm_source : undefined;
  const utmCampaign = typeof params.utm_campaign === 'string' ? params.utm_campaign : undefined;

  const { content, flags, sectionOrder, funnelStage } = await getPageContent(
    'driver_landing', 'atl',
    { utm_funnel: utmFunnel, utm_source: utmSource, utm_campaign: utmCampaign },
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
