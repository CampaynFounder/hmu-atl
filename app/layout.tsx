// Root Layout
// Configures Clerk authentication provider

import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter, Bebas_Neue, DM_Sans, Space_Mono } from 'next/font/google';
import { Header } from '@/components/layout/header';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { MetaPixel } from '@/components/analytics/meta-pixel';
import { AttributionTracker } from '@/components/analytics/attribution-tracker';
import { SmsOptInGate } from '@/components/auth/sms-opt-in-gate';
import { GlobalRideAlert } from '@/components/global-ride-alert';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';
import { getMarketBranding } from '@/lib/markets/branding';
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
  description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L.',
  alternates: {
    canonical: 'https://atl.hmucashride.com',
  },
  openGraph: {
    title: 'HMUCashRide - Drivers Get Paid UpFront',
    description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L.',
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
    description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L.',
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
          'HMU Cash Ride is the platform behind "hit me up cash ride" — private car rides for cash payment with upfront driver payment verification. How drivers know before they go.',
        foundingDate: '2026',
        areaServed: areaServedOrg,
        knowsAbout: [
          'private car rides for cash',
          'carpool services for cash',
          'cash ride driver payment',
          'upfront driver payment verification',
          `peer to peer rides ${seo.city}`,
        ],
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
          'Private car rides for cash payment. Carpool services for cash with upfront driver payment verification. Drivers know they are getting paid before they go. No more ride scammers.',
        slogan: 'How Drivers Know Before They Go',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free to sign up. Drivers set their own price.',
        },
        additionalType: 'https://schema.org/TaxiService',
        category: [
          'Private Transportation',
          'Carpool Services for Cash',
          'Cash Ride Platform',
          'Peer-to-Peer Rides',
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://hmucashride.com/#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is HMU Cash Ride?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'HMU Cash Ride is the first platform built for "hit me up cash ride" — private car rides for cash payment. Unlike Facebook groups where you post and hope for the best, HMU verifies payment upfront so drivers know they are getting paid before they pull up.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do cash ride drivers get paid?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Riders pay upfront through the app before the driver leaves. The money is held in escrow and released to the driver after the ride. Drivers set their own price — no surge pricing, no platform deciding what you earn.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is HMU Cash Ride safe?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'HMU Cash Ride verifies payment before the ride starts — that is how drivers know before they go. Riders are payment-verified, rides are GPS-tracked, and both parties can rate each other. No more ride scammers wasting your gas.',
            },
          },
          {
            '@type': 'Question',
            name: 'How is HMU Cash Ride different from Facebook cash ride groups?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Facebook cash ride groups have no payment protection — drivers get scammed, riders ghost, and nobody is verified. HMU Cash Ride holds the rider payment in escrow before the driver pulls up. If they do not pay, they do not ride. It is that simple.',
            },
          },
          {
            '@type': 'Question',
            name: `How do I carpool for cash in ${seo.city}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Sign up on HMU Cash Ride as a driver, set your price and the areas you serve, and go live. Riders in your area see your post and book directly. You get paid upfront — no chasing payments, no ride scammers, no wasted trips.',
            },
          },
          {
            '@type': 'Question',
            name: 'What does HMU Cash Ride cost for drivers?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Free to sign up. HMU takes a small platform fee that is capped daily and weekly — once you hit the cap, the rest of the day is all yours. HMU First members pay a flat 12% with a lower cap and get instant payouts after every ride.',
            },
          },
        ],
      },
    ],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Determine if this render is happening on a Clerk satellite subdomain.
  // Host comes from middleware-stamped x-market-slug (trusted allowlist) — we
  // only treat a request as a satellite when it's a KNOWN non-primary market.
  // ATL requests pass through with ClerkProvider in default (primary) mode, so
  // existing ATL behavior is byte-for-byte unchanged.
  const h = await headers();
  const slug = h.get(MARKET_SLUG_HEADER);
  const isSatellite = slug !== null && slug !== 'atl';
  const satelliteHost = isSatellite && slug ? `${slug}.hmucashride.com` : null;

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
