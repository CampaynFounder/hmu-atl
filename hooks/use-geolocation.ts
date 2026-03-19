'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface GeoState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  error: string | null;
  tracking: boolean;
}

interface UseGeolocationOptions {
  rideId: string | null;
  enabled: boolean;
  intervalMs?: number;
}

export function useGeolocation({ rideId, enabled, intervalMs = 10000 }: UseGeolocationOptions) {
  const [state, setState] = useState<GeoState>({
    lat: null, lng: null, accuracy: null, error: null, tracking: false,
  });
  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  const sendLocation = useCallback(async (lat: number, lng: number) => {
    if (!rideId) return;

    // Don't send if less than 50m moved and less than 10s elapsed
    if (lastSentRef.current) {
      const dist = haversineDistance(lastSentRef.current.lat, lastSentRef.current.lng, lat, lng);
      const elapsed = Date.now() - lastSentRef.current.time;
      if (dist < 50 && elapsed < intervalMs) return;
    }

    try {
      await fetch(`/api/rides/${rideId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      lastSentRef.current = { lat, lng, time: Date.now() };
    } catch {
      // silent — will retry next interval
    }
  }, [rideId, intervalMs]);

  useEffect(() => {
    if (!enabled || !rideId) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
      setState(s => ({ ...s, tracking: false }));
      return;
    }

    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }

    setState(s => ({ ...s, tracking: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setState({ lat, lng, accuracy, error: null, tracking: true });
      },
      (err) => {
        setState(s => ({ ...s, error: err.message }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    // Send location at fixed interval
    sendIntervalRef.current = setInterval(() => {
      if (state.lat && state.lng) {
        sendLocation(state.lat, state.lng);
      }
    }, intervalMs);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
    };
  }, [enabled, rideId, intervalMs, sendLocation, state.lat, state.lng]);

  return state;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
