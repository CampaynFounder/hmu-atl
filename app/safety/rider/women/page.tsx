import type { Metadata } from 'next';
import { SafetyWomenRidersClient } from './safety-women-riders-client';

export const metadata: Metadata = {
  title: 'Women Riders — HMU Rider Safety',
  description:
    'Safety options built specifically for women riders on HMU: filter to women drivers only, plus every standard HMU safeguard.',
};

export default function SafetyWomenRidersPage() {
  return <SafetyWomenRidersClient />;
}
