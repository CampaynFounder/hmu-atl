// Root Layout
// Configures Clerk authentication provider

import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'HMU Cash Ride - Metro Atlanta Peer-to-Peer Rideshare',
  description: 'Skip the surge. Build community. Metro Atlanta\'s affordable peer-to-peer ride network.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
