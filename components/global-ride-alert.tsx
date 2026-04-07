'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useAbly } from '@/hooks/use-ably';

interface RideAlert {
  type: string;
  rideId: string;
  driverName?: string;
  riderName?: string;
  price?: number;
  message?: string;
}

/**
 * Global ride alert listener. Subscribes to the rider/driver's Ably notify channel
 * and shows a full-screen interstitial when a critical ride event happens
 * (booking accepted, ride status change, etc.).
 *
 * Mount this once in the root layout — it handles its own auth check.
 */
export function GlobalRideAlert() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [alert, setAlert] = useState<RideAlert | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve internal user ID from Clerk
  useEffect(() => {
    if (!isLoaded || !isSignedIn) { setUserId(null); return; }

    fetch('/api/users/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.id) setUserId(data.id);
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn]);

  const handleMessage = useCallback((msg: { name: string; data: unknown }) => {
    const data = msg.data as Record<string, unknown>;

    if (msg.name === 'booking_accepted') {
      setAlert({
        type: 'booking_accepted',
        rideId: data.rideId as string,
        driverName: (data.driverName as string) || undefined,
        price: data.price ? Number(data.price) : undefined,
        message: (data.message as string) || undefined,
      });
      // Auto-dismiss after 30 seconds if rider doesn't tap
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => setAlert(null), 30000);
    }

    if (msg.name === 'ride_update' || msg.name === 'status_change') {
      const status = data.status as string;
      const rideId = data.rideId as string;
      if (rideId && ['otw', 'here'].includes(status)) {
        setAlert({
          type: 'ride_status',
          rideId,
          driverName: (data.driverName as string) || undefined,
          message: status === 'otw' ? 'Your driver is on the way!' : 'Your driver is here!',
        });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => setAlert(null), 20000);
      }
    }
  }, []);

  useAbly({
    channelName: userId ? `user:${userId}:notify` : null,
    onMessage: handleMessage,
  });

  if (!alert) return null;

  const isAccepted = alert.type === 'booking_accepted';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'alertFadeIn 0.3s ease-out',
    }}>
      <style>{`
        @keyframes alertFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes alertBounce { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes alertPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,230,118,0.4); } 50% { box-shadow: 0 0 0 20px rgba(0,230,118,0); } }
      `}</style>

      {/* Icon */}
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: isAccepted ? 'rgba(0,230,118,0.15)' : 'rgba(255,145,0,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, animation: 'alertPulse 2s ease-in-out infinite',
      }}>
        <span style={{ fontSize: 40 }}>
          {isAccepted ? '\u{1F91D}' : alert.message?.includes('here') ? '\u{1F4CD}' : '\u{1F697}'}
        </span>
      </div>

      {/* Title */}
      <h1 style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 36, color: '#fff', textAlign: 'center',
        lineHeight: 1, marginBottom: 8,
      }}>
        {isAccepted ? 'RIDE ACCEPTED!' : alert.message?.toUpperCase() || 'RIDE UPDATE'}
      </h1>

      {/* Subtitle */}
      <p style={{
        fontSize: 15, color: '#bbb', textAlign: 'center',
        lineHeight: 1.5, marginBottom: 8, maxWidth: 300,
      }}>
        {isAccepted
          ? `${alert.driverName || 'Your driver'} accepted your ride${alert.price ? ` — $${alert.price}` : ''}. Tap below to confirm your pickup.`
          : alert.message || 'Check your ride for updates.'}
      </p>

      {/* CTA */}
      <button
        onClick={() => {
          setAlert(null);
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
          router.push(`/ride/${alert.rideId}`);
        }}
        style={{
          width: '100%', maxWidth: 320, padding: 18, borderRadius: 100,
          border: 'none', background: '#00E676', color: '#080808',
          fontSize: 17, fontWeight: 800, cursor: 'pointer',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          marginTop: 16, animation: 'alertBounce 2s ease-in-out infinite',
        }}
      >
        {isAccepted ? 'Go to Ride' : 'Open Ride'}
      </button>

      {/* Dismiss */}
      <button
        onClick={() => {
          setAlert(null);
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
        }}
        style={{
          marginTop: 16, padding: '10px 20px', borderRadius: 100,
          border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
          color: '#888', fontSize: 13, cursor: 'pointer',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
