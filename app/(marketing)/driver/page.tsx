import DriverLandingClient from './driver-landing-client';

export const metadata = {
  title: 'HMU ATL — Make Money Doin Rides | Driver Sign Up',
  description: 'Set your price. Get paid upfront. No more Time Wasters HMU Secures Your Bag. Sign up free today.',
  openGraph: {
    title: 'HMU ATL — Bag Security for Driver Preneurs',
    description: 'Set your price. We Secure the Bag. Before you pull up. Sign up free.',
    url: 'https://atl.hmucashride.com/driver',
    siteName: 'HMU ATL Cash Ride',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HMU ATL — Bag Security for Doin Rides',
    description: 'Set your own price. Get paid upfront. ATL drivers sign up free.',
  },
};

export default function DriverLandingPage() {
  return <DriverLandingClient />;
}
