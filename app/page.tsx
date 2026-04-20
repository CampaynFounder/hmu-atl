import { headers } from 'next/headers';
import HomePageClient from './home-client';
import { getPageContent } from '@/lib/cms/queries';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';

export default async function HomePage({
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
    'homepage', brand.slug,
    { utm_funnel: utmFunnel, utm_source: utmSource, utm_campaign: utmCampaign, utm_persona: utmPersona },
  );

  return (
    <HomePageClient
      initialContent={content}
      initialFlags={flags}
      brandCity={brand.city}
      brandCityShort={brand.cityShort}
    />
  );
}
