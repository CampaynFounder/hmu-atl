'use client';

// Driver-side location publisher for /rider/browse distance badges.
//
// Runs alongside useDriverPresence. Watches navigator.geolocation while the
// driver is foregrounded, throttles updates client-side, and POSTs to
// /api/driver/location. Server already throttles + validates, so this is
// belt-and-suspenders for battery and bandwidth.
//
// Privacy: coords leave the device only as part of an authenticated POST to
// our own server. They are NEVER returned to clients — queryBrowseDrivers
// only emits scalar distance.

import { useEffect, useRef } from 'react';

const MIN_INTERVAL_MS = 60 * 1000;        // 1 update / 60s minimum cadence
const MIN_MOVEMENT_METERS = 100;          // OR 100m of movement, whichever sooner
const MAX_ACCEPTABLE_ACCURACY_M = 5000;   // mirror server-side cutoff

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function useDriverLocationPublisher(enabled: boolean) {
  const watchIdRef = useRef<number | null>(null);
  const lastPostRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (typeof document === 'undefined') return;

    let cancelled = false;

    function clearWatch() {
      if (watchIdRef.current != null) {
        try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { /* ignore */ }
        watchIdRef.current = null;
      }
    }

    function publish(lat: number, lng: number, accuracy: number) {
      fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, accuracy: Math.round(accuracy) }),
        keepalive: true,
      }).catch(() => { /* fire-and-forget; we'll retry on next tick */ });
    }

    function onPosition(p: GeolocationPosition) {
      if (cancelled) return;
      const acc = p.coords.accuracy;
      if (!Number.isFinite(acc) || acc > MAX_ACCEPTABLE_ACCURACY_M) return;
      const lat = p.coords.latitude;
      const lng = p.coords.longitude;
      const now = Date.now();
      const last = lastPostRef.current;

      // Throttle: only publish if it's been >MIN_INTERVAL_MS since the last
      // post OR we've moved >MIN_MOVEMENT_METERS. First post always goes.
      if (last) {
        const elapsed = now - last.at;
        const moved = haversineMeters(last, { lat, lng });
        if (elapsed < MIN_INTERVAL_MS && moved < MIN_MOVEMENT_METERS) return;
      }

      lastPostRef.current = { lat, lng, at: now };
      publish(lat, lng, acc);
    }

    function onError(_err: GeolocationPositionError) {
      // Silently swallow — common cases are user-denied (we won't get any
      // points anyway) and timeout (next tick will retry). No retry storm
      // because watchPosition keeps emitting whenever the OS has a fix.
    }

    function startIfVisible() {
      const visible = document.visibilityState === 'visible';
      if (visible && watchIdRef.current == null) {
        watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
          // enableHighAccuracy=false → cell-tower / wifi fix is fine for a
          // distance badge, and saves battery dramatically vs GPS.
          enableHighAccuracy: false,
          maximumAge: 30_000,
          timeout: 30_000,
        });
      } else if (!visible) {
        clearWatch();
      }
    }

    const onVisibility = () => startIfVisible();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('blur', onVisibility);

    startIfVisible();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('blur', onVisibility);
      clearWatch();
    };
  }, [enabled]);
}
