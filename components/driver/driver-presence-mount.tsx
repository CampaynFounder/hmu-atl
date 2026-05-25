'use client';

import { useEffect, useState } from 'react';
import { useDriverPresence } from '@/hooks/use-driver-presence';
import { useDriverLocationPublisher } from '@/hooks/use-driver-location-publisher';

// Renders nothing — wires presence + location-publisher effects.
// Fetches location_sharing_enabled from the DB on mount so that a driver who
// has opted out of live GPS doesn't have their position published, regardless
// of which device they're on. Defaults to false until the preference loads so
// GPS never fires without explicit confirmation.
export default function DriverPresenceMount({ marketSlug }: { marketSlug: string | null }) {
  useDriverPresence(marketSlug);

  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/driver/location')
      .then((r) => r.json())
      .then((d: { location_sharing_enabled?: boolean }) => {
        setLocationEnabled(d.location_sharing_enabled === true);
      })
      .catch(() => {
        // Network error — keep GPS off rather than unknowingly publishing.
      });
  }, []);

  useDriverLocationPublisher(locationEnabled);

  return null;
}
