import type { Metadata } from 'next';
import SupportContent from './support-content';

export const metadata: Metadata = {
  title: 'Support — HMU Cash Ride',
  description:
    'Get help with HMU Cash Ride. Answers for riders and drivers on booking, payments, payouts, safety, and your account — plus how to reach a real human.',
};

export default function SupportPage() {
  return <SupportContent />;
}
