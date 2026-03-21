'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface GeoState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  error: string | null;
  permanentlyDenied: boolean;
  tracking: boolean;
}

interface UseGeolocationOptions {
  rideId: string | null;
  enabled: boolean;
  intervalMs?: number;
}

export function useGeolocation({ rideId, enabled, intervalMs = 10000 }: UseGeolocationOptions) {
  const [state, setState] = useState<GeoState>({
    lat: null, lng: null, accuracy: null, error: null, permanentlyDenied: false, tracking: false,
  });
  const [retryCount, setRetryCount] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const latestCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const rideIdRef = useRef(rideId);
  rideIdRef.current = rideId;

  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
  }, []);

  const sendLocation = useCallback(async (lat: number, lng: number) => {
    const rid = rideIdRef.current;
    if (!rid) return;

    if (lastSentRef.current) {
      const dist = haversineDistance(lastSentRef.current.lat, lastSentRef.current.lng, lat, lng);
      const elapsed = Date.now() - lastSentRef.current.time;
      if (dist < 50 && elapsed < intervalMs) return;
    }

    try {
      await fetch(`/api/rides/${rid}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      lastSentRef.current = { lat, lng, time: Date.now() };
    } catch {
      // silent — will retry next interval
    }
  }, [intervalMs]);

  useEffect(() => {
    if (!enabled || !rideId) {
      cleanup();
      setState(s => ({ ...s, tracking: false }));
      return;
    }

    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }

    // Clean up any previous watch before starting a new one
    cleanup();

    setState(s => ({ ...s, tracking: true, error: null, permanentlyDenied: false }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        latestCoordsRef.current = { lat, lng };
        setState({ lat, lng, accuracy, error: null, permanentlyDenied: false, tracking: true });
      },
      (err) => {
        if (err.code === 1) {
          // PERMISSION_DENIED — check if permanently blocked
          if ('permissions' in navigator) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
              setState(s => ({ ...s, error: 'Location access denied', permanentlyDenied: result.state === 'denied' }));
            }).catch(() => {
              setState(s => ({ ...s, error: 'Location access denied', permanentlyDenied: false }));
            });
          } else {
            setState(s => ({ ...s, error: 'Location access denied', permanentlyDenied: false }));
          }
        } else {
          setState(s => ({ ...s, error: err.message, permanentlyDenied: false }));
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    // Send location at fixed interval using ref (no stale closure)
    sendIntervalRef.current = setInterval(() => {
      const coords = latestCoordsRef.current;
      if (coords) {
        sendLocation(coords.lat, coords.lng);
      }
    }, intervalMs);

    return cleanup;
  }, [enabled, rideId, intervalMs, sendLocation, cleanup, retryCount]);

  const retry = useCallback(() => {
    // Safari caches permission denial for the page session —
    // must reload to pick up changed settings
    window.location.reload();
  }, []);

  return { ...state, retry };
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
