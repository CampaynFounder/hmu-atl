// Root Layout
// Configures Clerk authentication provider

import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter, Bebas_Neue, DM_Sans, Space_Mono } from 'next/font/google';
import { Header } from '@/components/layout/header';
import { ChunkErrorHandler } from '@/components/layout/chunk-error-handler';
import { AppRecoveryWatchdog } from '@/components/layout/app-recovery-watchdog';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { MetaPixel } from '@/components/analytics/meta-pixel';
import { AttributionTracker } from '@/components/analytics/attribution-tracker';
import { SmsOptInGate } from '@/components/auth/sms-opt-in-gate';
import { GlobalRideAlert } from '@/components/global-ride-alert';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';
import { getMarketBranding } from '@/lib/markets/branding';
import { getFaq } from '@/lib/marketing/faq';
import './globals.css';

// Clerk primary application domain. Every other market subdomain that renders
// this app is a Clerk satellite (see Clerk Dashboard → Domains → Satellites)
// and must proxy unauth flows here.
const CLERK_PRIMARY_HOST = 'atl.hmucashride.com';

// Per-market SEO context for the JSON-LD schema.org block.
interface MarketSeo {
  city: string;         // e.g. 'Atlanta' / 'New Orleans'
  state: string;        // e.g. 'Georgia' / 'Louisiana'
  cityWikidata?: string;
  brandAlias: string;   // e.g. 'HMU ATL' / 'HMU NOLA'
}

const MARKET_SEO: Record<string, MarketSeo> = {
  atl: {
    city: 'Atlanta',
    state: 'Georgia',
    cityWikidata: 'https://www.wikidata.org/wiki/Q23556',
    brandAlias: 'HMU ATL',
  },
  nola: {
    city: 'New Orleans',
    state: 'Louisiana',
    cityWikidata: 'https://www.wikidata.org/wiki/Q34404',
    brandAlias: 'HMU NOLA',
  },
};

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const dmSans = DM_Sans({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-body' });
const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://atl.hmucashride.com'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  title: 'HMUCashRide - Drivers Get Paid UpFront',
  description:
    'Make Bank Trips not Blank Trips. HMU is the fastest-growing cash ride & delivery platform — drivers get paid upfront, every ride is GPS-tracked for safety, and riders can blast one request to all nearby drivers. Built in Atlanta, now launching in communities nationwide after 15,000+ rides.',
  alternates: {
    canonical: 'https://atl.hmucashride.com',
  },
  openGraph: {
    title: 'HMUCashRide - Drivers Get Paid UpFront',
    description:
      'The fastest-growing cash ride & delivery platform. Drivers get paid upfront and typically earn $150+. Every ride is GPS-tracked for safety. Blast a request to all nearby drivers, book a Down Bad ride when times are hard, or send a cash delivery. Built in Atlanta, launching nationwide.',
    url: 'https://atl.hmucashride.com',
    siteName: 'HMUCASHRIDE',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://atl.hmucashride.com/og-image.jpeg', width: 1200, height: 630, alt: 'Oh u ride scammin? HMU Cash Ride' }],
  },
  twitter: {
    images: ['https://atl.hmucashride.com/og-image.jpeg'],
    card: 'summary_large_image',
    title: 'HMUCashRide - Drivers Get Paid UpFront',
    description:
      'The fastest-growing cash ride & delivery platform. Paid upfront, GPS-tracked rides, blast to all nearby drivers, Down Bad rides, and cash deliveries. Built in Atlanta, launching nationwide after 15,000+ rides.',
  },
  other: {
    'facebook-domain-verification': 'mttfsmzqmugljmd7ybwy3vgb2mzl8i',
  },
};

function buildJsonLd(seo: MarketSeo) {
  const areaServedOrg: Record<string, unknown> = {
    '@type': 'City',
    name: seo.city,
  };
  if (seo.cityWikidata) areaServedOrg['@id'] = seo.cityWikidata;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://hmucashride.com/#organization',
        name: 'HMU Cash Ride',
        alternateName: ['HMUCASHRIDE', seo.brandAlias, 'HMU Cash Ride Corp'],
        url: 'https://hmucashride.com',
        logo: 'https://atl.hmucashride.com/og-image.jpeg',
        description:
          'HMU Cash Ride is the fastest-growing peer-to-peer cash ride and delivery platform in the United States. Drivers get paid upfront and typically earn $150 or more, every ride is GPS-tracked for safety, and riders can blast a single request to all nearby drivers, book a Down Bad ride during temporary hard times, or send a cash delivery. Founded in Atlanta, HMU has completed more than 15,000 rides and is now launching in communities nationwide.',
        slogan: 'How Drivers Know Before They Go',
        foundingDate: '2026',
        foundingLocation: {
          '@type': 'Place',
          name: 'Atlanta, Georgia',
        },
        areaServed: areaServedOrg,
        knowsAbout: [
          'private car rides for cash',
          'carpool services for cash',
          'cash ride driver payment',
          'upfront driver payment verification',
          'in-ride GPS safety tracking',
          'ride request blast to all nearby drivers',
          'down bad rides for riders facing hard times',
          'cash deliveries',
          `peer to peer rides ${seo.city}`,
        ],
        interactionStatistic: {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/TravelAction',
          userInteractionCount: 15000,
          description: 'Rides completed on HMU Cash Ride',
        },
        sameAs: ['https://www.facebook.com/hmucashride'],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://hmucashride.com/#website',
        url: 'https://hmucashride.com',
        name: 'HMU Cash Ride',
        publisher: { '@id': 'https://hmucashride.com/#organization' },
      },
      {
        '@type': 'Service',
        '@id': 'https://hmucashride.com/#service',
        name: 'HMU Cash Ride — Upfront Driver Payment System',
        serviceType: 'Private Transportation',
        provider: { '@id': 'https://hmucashride.com/#organization' },
        areaServed: {
          '@type': 'City',
          name: seo.city,
          containedInPlace: { '@type': 'State', name: seo.state },
        },
        description:
          'Private car rides and cash deliveries with upfront driver payment. Drivers know they are getting paid before they go and typically earn $150 or more. Every ride is GPS-tracked in real time for the safety of both riders and drivers. Riders can blast a single request to all nearby drivers, book a Down Bad ride during temporary hard times, or send a cash delivery.',
        slogan: 'How Drivers Know Before They Go',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free to sign up. Drivers set their own price.',
        },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'HMU Cash Ride & Delivery Options',
          itemListElement: [
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Direct Cash Ride',
                description:
                  'Book a specific nearby driver for a cash ride. Payment is verified upfront and the ride is GPS-tracked end to end.',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Blast Ride',
                description:
                  'Send one ride request to every nearby driver at once and pick whichever driver responds first or offers the best price.',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Down Bad Ride',
                description:
                  'Discounted, community-supported rides for riders facing temporary hard times so they can still get where they need to go.',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Cash Delivery',
                description:
                  'Local pickup and delivery handled by nearby drivers and paid in cash, with the same upfront payment and GPS tracking as a ride.',
              },
            },
          ],
        },
        additionalType: 'https://schema.org/TaxiService',
        category: [
          'Private Transportation',
          'Carpool Services for Cash',
          'Cash Ride Platform',
          'Peer-to-Peer Rides',
          'Cash Delivery Service',
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://hmucashride.com/#faq',
        mainEntity: getFaq(seo.city).map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Determine if this render is happening on a Clerk satellite.
  // ATL (the Clerk primary) runs in default mode — no change.
  // All other markets (NOLA, future cities) run as Clerk satellites.
  //
  // Satellite domain = the ACTUAL host the user is on, not ${slug}.hmucashride.com.
  // This supports both:
  //   a) nola.hmucashride.com  — classic per-market subdomain (legacy NOLA)
  //   b) hmucashride.com       — apex satellite (new markets, no subdomain needed)
  //      Requires hmucashride.com to be registered in Clerk dashboard → Satellites.
  const h = await headers();
  const slug = h.get(MARKET_SLUG_HEADER);
  // Middleware stamps this on every public/marketing route (see buildPublicResponse).
  // The auth-recovery watchdog is an authenticated-app tool — keep it off public
  // pages so a slow/blocked Clerk can't cover a marketing page with a reset overlay.
  const isPublicRoute = h.get('x-hmu-public-route') === '1';
  const actualHost = h.get('host')?.toLowerCase().split(':')[0] || '';
  const isSatellite = slug !== null && slug !== 'atl' && slug !== 'none';
  // Use the actual host so Clerk's handshake targets the right domain.
  const satelliteHost = isSatellite ? (actualHost || `${slug}.hmucashride.com`) : null;

  const clerkProps = isSatellite && satelliteHost
    ? {
        isSatellite: true as const,
        domain: satelliteHost,
        signInUrl: `https://${CLERK_PRIMARY_HOST}/sign-in`,
        signUpUrl: `https://${CLERK_PRIMARY_HOST}/sign-up`,
      }
    : {};

  // Build per-market JSON-LD so schema.org metadata reflects the correct city,
  // state, and brand alias. ATL requests get identical structured data to before.
  const seo = MARKET_SEO[slug || 'atl'] || MARKET_SEO.atl;
  const jsonLd = buildJsonLd(seo);
  const brand = getMarketBranding(slug);
  const brandLabel = `HMU ${brand.cityShort}`;

  return (
    <ClerkProvider {...clerkProps}>
      <html lang="en">
        <head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </head>
        <body className={`${inter.variable} ${bebasNeue.variable} ${dmSans.variable} ${spaceMono.variable} font-sans antialiased`}>
          <ChunkErrorHandler />
          {!isPublicRoute && <AppRecoveryWatchdog />}
          <Suspense>
            <PostHogProvider>
              <MetaPixel />
              <AttributionTracker />
              <Header brandLabel={brandLabel} />
              <GlobalRideAlert />
              {children}
              <SmsOptInGate />
            </PostHogProvider>
          </Suspense>
        </body>
      </html>
    </ClerkProvider>
  );
}
