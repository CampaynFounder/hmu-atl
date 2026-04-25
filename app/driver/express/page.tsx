// /driver/express — pre-auth funnel for express driver onboarding.
// Shows micro-animated mock rider profiles. Tapping any card routes the
// visitor to Clerk sign-up with mode=express which the rest of the funnel
// honors (auth-callback forwards mode → /onboarding renders the express
// flow controlled by platform_config 'onboarding.driver_express').

import { Metadata } from 'next';
import { ExpressLandingClient } from './express-landing-client';

export const metadata: Metadata = {
  title: 'Make more $$$ — drive on HMU',
  description:
    'Real Atlanta riders looking for a ride right now. Sign up in under a minute and start earning today.',
};

export default function DriverExpressPage() {
  return <ExpressLandingClient />;
}
