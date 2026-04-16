import { NextRequest, NextResponse } from 'next/server';
import { getPageContent } from '@/lib/cms/queries';

const VALID_PAGES = ['homepage', 'driver_landing', 'rider_landing', 'driver_guide', 'rider_guide'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageSlug: string }> },
) {
  const { pageSlug } = await params;

  if (!VALID_PAGES.includes(pageSlug)) {
    return NextResponse.json({ error: 'Invalid page slug' }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const market = searchParams.get('market') || 'atl';
  const utmSource = searchParams.get('utm_source') || undefined;
  const utmCampaign = searchParams.get('utm_campaign') || undefined;
  const utmFunnel = searchParams.get('utm_funnel') || undefined;
  const utmPersona = searchParams.get('utm_persona') || undefined;
  const visitorId = searchParams.get('visitor_id') || undefined;

  const utmParams = utmSource || utmCampaign || utmFunnel || utmPersona
    ? { utm_source: utmSource, utm_campaign: utmCampaign, utm_funnel: utmFunnel, utm_persona: utmPersona }
    : undefined;

  const data = await getPageContent(pageSlug, market, utmParams, visitorId);

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
