import RiderLandingClient from './rider-landing-client';

export const metadata = {
  title: 'HMU Cash Ride — Private Car Rides for Cash | Skip the Surge Atlanta',
  description: 'Private car rides for cash payment across Metro Atlanta. Save up to 60% vs Uber. Payment-verified drivers. No surge pricing. Sign up free.',
  alternates: {
    canonical: 'https://atl.hmucashride.com/rider',
  },
  openGraph: {
    title: 'HMU Cash Ride — Private Car Rides for Cash in Atlanta',
    description: 'Skip the surge. Private car rides for cash payment. Payment-verified drivers. Save up to 60%. Sign up free.',
    url: 'https://atl.hmucashride.com/rider',
    siteName: 'HMUCASHRIDE',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://atl.hmucashride.com/og-image.jpeg', width: 1200, height: 630, alt: 'HMU Cash Ride - Private Car Rides for Cash' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HMU Cash Ride — Skip the Surge, Ride for Cash',
    description: 'Private car rides for cash in Atlanta. No surge pricing. Payment-verified drivers. Sign up free.',
    images: ['https://atl.hmucashride.com/og-image.jpeg'],
  },
};

export default function RiderLandingPage() {
  return <RiderLandingClient />;
}
