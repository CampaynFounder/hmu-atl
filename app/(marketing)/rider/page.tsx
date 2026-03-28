import RiderLandingClient from './rider-landing-client';

export const metadata = {
  title: 'HMU Cash Ride — Make Bank Trips not Blank Trips',
  description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Save up to 60% vs Uber. No surge pricing. Sign up free.',
  alternates: {
    canonical: 'https://atl.hmucashride.com/rider',
  },
  openGraph: {
    title: 'HMU Cash Ride — Make Bank Trips not Blank Trips',
    description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Save up to 60% vs Uber. Sign up free.',
    url: 'https://atl.hmucashride.com/rider',
    siteName: 'HMUCASHRIDE',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://atl.hmucashride.com/og-image.jpeg', width: 1200, height: 630, alt: 'HMU Cash Ride - Make Bank Trips not Blank Trips' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HMU Cash Ride — Make Bank Trips not Blank Trips',
    description: 'Make Bank Trips not Blank Trips. Ride Scammers Hold the L. Sign up free.',
    images: ['https://atl.hmucashride.com/og-image.jpeg'],
  },
};

export default function RiderLandingPage() {
  return <RiderLandingClient />;
}
