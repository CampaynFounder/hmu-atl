import type { Metadata } from 'next';
import { SafetyDriverClient } from './safety-driver-client';

export const metadata: Metadata = {
  title: 'Driver Safety — HMU ATL',
  description:
    'How HMU keeps drivers safe: deposit guarantees, GPS-tracked rides, mid-ride check-ins, women-only rider matching, and a real human review queue.',
};

export default function SafetyDriverPage() {
  return <SafetyDriverClient />;
}
