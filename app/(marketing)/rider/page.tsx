import RiderLandingClient from './rider-landing-client';

export const metadata = {
  title: 'HMU ATL — Skip the Surge | Affordable Rides Across Metro Atlanta',
  description: 'Save up to 60% on every ride. No surge pricing. Pay securely with escrow. Real drivers, real community. Sign up free.',
  openGraph: {
    title: 'HMU ATL — Skip the Surge, Ride for Less',
    description: 'Save up to 60% on rides across Metro Atlanta. No surge. Escrow-protected payments. Sign up free.',
    url: 'https://atl.hmucashride.com/rider',
    siteName: 'HMU ATL Cash Ride',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HMU ATL — Skip the Surge, Ride for Less',
    description: 'Save up to 60% on rides across Metro Atlanta. No surge pricing. Sign up free.',
  },
};

export default function RiderLandingPage() {
  return <RiderLandingClient />;
}
