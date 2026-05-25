import { headers } from 'next/headers';
import ComparePageClient from './compare-client';
import { getPageContent } from '@/lib/cms/queries';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';
import { getCompareSnapshot } from '@/lib/payments/strategies/compare-snapshot';

export const metadata = {
  title: 'HMU vs. Rideshare & Membership Apps — Real Driver Math',
  description:
    'Other apps make sure THEY get paid. HMU makes sure DRIVERS get paid. Compare the cuts, the fees, and the math against Uber, Lyft, and membership rideshare apps.',
};

export default async function ComparePage({
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

  const { content, flags } = await getPageContent(
    'compare',
    brand.slug,
    { utm_funnel: utmFunnel, utm_source: utmSource, utm_campaign: utmCampaign, utm_persona: utmPersona },
  );

  // Resolve the example fare from CMS (admin-tunable), then derive every
  // HMU pricing number from the live pricing_modes.config via the snapshot
  // helper. The CMS never holds HMU pricing strings — single source of truth.
  const exampleFareRaw = content?.['example_fare_dollars'];
  const parsed = typeof exampleFareRaw === 'string' ? parseFloat(exampleFareRaw) : NaN;
  const exampleFare = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  const snapshot = await getCompareSnapshot(exampleFare);

  return (
    <ComparePageClient
      initialContent={content}
      initialFlags={flags}
      brandCity={brand.city}
      brandCityShort={brand.cityShort}
      snapshot={snapshot}
    />
  );
}
