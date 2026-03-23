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
  title: 'HMU Cash Ride - Payment Ready Passenger Verification',
  description: 'Skip the surge. Build community. Metro Atlanta\'s affordable peer-to-peer ride network.',
  other: {
    'facebook-domain-verification': 'mttfsmzqmugljmd7ybwy3vgb2mzl8i',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
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
