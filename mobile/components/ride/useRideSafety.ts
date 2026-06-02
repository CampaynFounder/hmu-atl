// Shared ride safety — used by both rider and driver active screens.
// Two surfaces:
//  1) Scheduled check-in: server fires Ably `safety_check_prompt` to one party;
//     the screen calls ingestPrompt() from its onMessage. Respond → /safety/respond.
//  2) Manual SOS (panic) button, always available during the ride → /safety/distress.

import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { apiClient } from '@/lib/api';
import { ViewerRole } from './types';

export type DistressKind = 'admin' | '911' | 'contact';

async function getGps(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch { return null; }
}

export function useRideSafety(
  rideId: string | undefined,
  getToken: () => Promise<string | null>,
  viewerRole: ViewerRole,
) {
  const [check, setCheck] = useState<{ checkId: string; secs: number } | null>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Auto-dismiss countdown for a scheduled check-in.
  useEffect(() => {
    if (!check) return;
    if (check.secs <= 0) { setCheck(null); return; }
    const id = setInterval(() => setCheck((c) => (c ? { ...c, secs: c.secs - 1 } : c)), 1000);
    return () => clearInterval(id);
  }, [check]);

  // Called from the parent's Ably onMessage for `safety_check_prompt`.
  const ingestPrompt = useCallback((d: { checkId?: string; party?: string; autoDismissSeconds?: number }) => {
    if (!d?.checkId) return;
    if (d.party && d.party !== viewerRole) return; // the prompt is for the other party
    setCheck({ checkId: d.checkId, secs: d.autoDismissSeconds ?? 60 });
  }, [viewerRole]);

  // Respond to a scheduled check-in. 'ok' = all good; 'alert' escalates.
  const respond = useCallback(async (response: 'ok' | 'alert', distress?: DistressKind) => {
    if (!rideId || !check || busy) return;
    setBusy(true);
    try {
      const t = await getToken();
      const gps = response === 'alert' ? await getGps() : null;
      await apiClient(`/rides/${rideId}/safety/respond`, t, {
        method: 'POST',
        body: JSON.stringify({
          checkId: check.checkId, response,
          ...(gps ? { lat: gps.lat, lng: gps.lng } : {}),
          ...(distress ? { distress } : {}),
        }),
      });
      if (distress === '911') Linking.openURL('tel:911').catch(() => {});
      setCheck(null);
    } catch { /* keep overlay so they can retry */ }
    finally { setBusy(false); }
  }, [rideId, check, busy, getToken]);

  // Manual SOS (no active check-in).
  const distress = useCallback(async (kind: DistressKind) => {
    if (!rideId || busy) return;
    setBusy(true);
    try {
      const t = await getToken();
      const gps = await getGps();
      await apiClient(`/rides/${rideId}/safety/distress`, t, {
        method: 'POST',
        body: JSON.stringify({ kind, ...(gps ? { lat: gps.lat, lng: gps.lng } : {}) }),
      });
      if (kind === '911') Linking.openURL('tel:911').catch(() => {});
      setSosOpen(false);
    } catch { /* surfaced by caller if needed */ }
    finally { setBusy(false); }
  }, [rideId, busy, getToken]);

  return { check, ingestPrompt, respond, distress, sosOpen, setSosOpen, busy };
}
