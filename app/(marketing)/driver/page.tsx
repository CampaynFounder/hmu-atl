import DriverLandingClient from './driver-landing-client';

export const metadata = {
  title: 'HMU Cash Ride — Private Car Rides for Cash | Driver Sign Up',
  description: 'Carpool for cash with upfront driver payment verification. Set your price. Know you are getting paid before you go. No more ride scammers. Sign up free.',
  alternates: {
    canonical: 'https://atl.hmucashride.com/driver',
  },
  openGraph: {
    title: 'HMU Cash Ride — How Drivers Know Before They Go',
    description: 'Private car rides for cash payment. Upfront driver payment verification. Set your price. Sign up free.',
    url: 'https://atl.hmucashride.com/driver',
    siteName: 'HMUCASHRIDE',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://atl.hmucashride.com/og-image.jpeg', width: 1200, height: 630, alt: 'HMU Cash Ride - Upfront Driver Payment' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HMU Cash Ride — How Drivers Know Before They Go',
    description: 'Private car rides for cash. Upfront payment verification. No ride scammers. Sign up free.',
    images: ['https://atl.hmucashride.com/og-image.jpeg'],
  },
};

export default function DriverLandingPage() {
  return <DriverLandingClient />;
}
