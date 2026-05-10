import type { Metadata } from 'next';
import { SafetyIndexClient } from './safety-index-client';

export const metadata: Metadata = {
  title: 'Safety — HMU ATL',
  description:
    'How HMU keeps drivers and riders safe: deposit guarantees, GPS-tracked rides, mid-ride check-ins, women-only matching, and a real human review queue.',
};

export default function SafetyIndexPage() {
  return <SafetyIndexClient />;
}
