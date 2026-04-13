import type { Metadata } from 'next';
import PitchClient from './pitch-client';

export const metadata: Metadata = {
  title: 'HMU Cash Ride — Investor Pitch',
  description: 'The happy path, frame by frame. Driver, Rider, and Platform flows — how HMU Cash Ride turns a shared link into a paid ride in Atlanta.',
  alternates: { canonical: 'https://atl.hmucashride.com/pitch' },
  openGraph: {
    title: 'HMU Cash Ride — Investor Pitch',
    description: 'The happy path, frame by frame. Driver, Rider, and Platform flows — how HMU Cash Ride turns a shared link into a paid ride in Atlanta.',
    url: 'https://atl.hmucashride.com/pitch',
    siteName: 'HMUCASHRIDE',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://atl.hmucashride.com/og-image.jpeg', width: 1200, height: 630, alt: 'HMU Cash Ride Pitch' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HMU Cash Ride — Investor Pitch',
    description: 'The happy path, frame by frame.',
    images: ['https://atl.hmucashride.com/og-image.jpeg'],
  },
};

export default function PitchPage() {
  return <PitchClient />;
}
