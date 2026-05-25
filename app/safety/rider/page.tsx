import type { Metadata } from 'next';
import { SafetyRiderClient } from './safety-rider-client';

export const metadata: Metadata = {
  title: 'Rider Safety — HMU ATL',
  description:
    'How HMU keeps riders safe: women-only driver filter, deposit refund guarantees, GPS-tracked rides, mid-ride check-ins, and a real human review queue.',
};

export default function SafetyRiderPage() {
  return <SafetyRiderClient />;
}
