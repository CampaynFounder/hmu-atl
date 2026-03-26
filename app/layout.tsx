// Root Layout
// Configures Clerk authentication provider

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter, Bebas_Neue, DM_Sans, Space_Mono } from 'next/font/google';
import { Header } from '@/components/layout/header';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { MetaPixel } from '@/components/analytics/meta-pixel';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const dmSans = DM_Sans({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-body' });
const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  metadataBase: new URL('https://atl.hmucashride.com'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  title: 'HMUCashRide - Drivers Get Paid UpFront',
  description: 'Ride Scammers Hate HMU. They Go Ghost? You Get Paid. You Cancel? They Lose Nothing.',
  alternates: {
    canonical: 'https://atl.hmucashride.com',
  },
  openGraph: {
    title: 'HMUCashRide - Drivers Get Paid UpFront',
    description: 'Ride Scammers Hate HMU. They Go Ghost? You Get Paid. You Cancel? They Lose Nothing.',
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
    description: 'Ride Scammers Hate HMU. They Go Ghost? You Get Paid. You Cancel? They Lose Nothing.',
  },
  other: {
    'facebook-domain-verification': 'mttfsmzqmugljmd7ybwy3vgb2mzl8i',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://hmucashride.com/#organization',
      name: 'HMU Cash Ride',
      alternateName: ['HMUCASHRIDE', 'HMU ATL', 'HMU Cash Ride Corp'],
      url: 'https://hmucashride.com',
      logo: 'https://atl.hmucashride.com/og-image.jpeg',
      description:
        'HMU Cash Ride is the platform behind "hit me up cash ride" — private car rides for cash payment with upfront driver payment verification. How drivers know before they go.',
      foundingDate: '2026',
      areaServed: {
        '@type': 'City',
        name: 'Atlanta',
        '@id': 'https://www.wikidata.org/wiki/Q23556',
      },
      knowsAbout: [
        'private car rides for cash',
        'carpool services for cash',
        'cash ride driver payment',
        'upfront driver payment verification',
        'peer to peer rides Atlanta',
      ],
      sameAs: [
        'https://www.facebook.com/hmucashride',
      ],
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
        name: 'Atlanta',
        containedInPlace: { '@type': 'State', name: 'Georgia' },
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
          name: 'How do I carpool for cash in Atlanta?',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
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
              <Header />
              {children}
            </PostHogProvider>
          </Suspense>
        </body>
      </html>
    </ClerkProvider>
  );
}
