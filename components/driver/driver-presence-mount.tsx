'use client';

import { useDriverPresence } from '@/hooks/use-driver-presence';

// Renders nothing — just wires the presence effect. Mounted from the driver
// layout so every /driver/* page keeps the driver in presence while open.
export default function DriverPresenceMount({ marketSlug }: { marketSlug: string | null }) {
  useDriverPresence(marketSlug);
  return null;
}
