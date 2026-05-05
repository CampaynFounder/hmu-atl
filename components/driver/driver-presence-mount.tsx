'use client';

import { useDriverPresence } from '@/hooks/use-driver-presence';
import { useDriverLocationPublisher } from '@/hooks/use-driver-location-publisher';

// Renders nothing — just wires the presence + location-publisher effects.
// Mounted from the driver layout so every /driver/* page keeps the driver
// in presence and (if permission granted) publishing their coarse location
// for the rider browse distance badge.
export default function DriverPresenceMount({ marketSlug }: { marketSlug: string | null }) {
  useDriverPresence(marketSlug);
  // Always-on: the publisher itself no-ops if the browser denies geolocation,
  // so we don't need a separate gate. If we add an in-app opt-out later,
  // wire it through here.
  useDriverLocationPublisher(true);
  return null;
}
