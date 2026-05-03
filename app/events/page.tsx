import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';
import { EventsPageClient } from './events-client';

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  return {
    title: `HMU ${brand.cityShort} · Event Partnerships`,
    description: `Partner with HMU for flat-rate round trips that keep ${brand.city} event floors packed. No surge, no no-shows.`,
    openGraph: {
      title: `HMU ${brand.cityShort} · Event Partnerships`,
      description: `Flat-rate round trips for ${brand.city} events. Beat surge. Pack the floor.`,
      images: [brand.ogImage],
    },
  };
}

export default async function EventsPage() {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));

  return (
    <EventsPageClient
      city={brand.city}
      cityShort={brand.cityShort}
      marketSlug={brand.slug}
    />
  );
}
