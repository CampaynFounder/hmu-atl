import type { Metadata } from 'next';
import { SafetyWomenDriversClient } from './safety-women-drivers-client';

export const metadata: Metadata = {
  title: 'Women Drivers — HMU Driver Safety',
  description:
    'Safety options built specifically for women drivers on HMU: lock matching to women riders only, plus every standard HMU safeguard.',
};

export default function SafetyWomenDriversPage() {
  return <SafetyWomenDriversClient />;
}
