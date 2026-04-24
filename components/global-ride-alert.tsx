'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter, usePathname } from 'next/navigation';
import { useAbly } from '@/hooks/use-ably';

interface RideAlert {
  type: string;
  rideId: string;
  driverName?: string;
  riderName?: string;
  price?: number;
  message?: string;
  // booking_declined extras — surfaced from the API payload so the rider can
  // see WHY the driver passed and what to do next without leaving the page.
  postId?: string;
  reason?: 'price' | 'distance' | 'booked' | 'other' | null;
  driverMessage?: string | null;
}

// Reason key → human label for the chip on the booking_declined alert.
// Matches PassReasonSheet on the driver side so the rider sees the same words.
const REASON_LABEL: Record<string, string> = {
  price: 'Price too low',
  distance: 'Too far / wrong way',
  booked: 'Already booked',
  other: 'Something else',
};

// Ably's rewind=2m delivers recent messages on reconnect, so a rider who
// navigates back to the app after a ride has already ended can get a
// replayed 'here' or 'otw' event and see "Your driver is here!" again.
// Real-time events are always <1s old; anything older than this threshold
// is almost certainly a rewind replay and should be suppressed.
const ALERT_MAX_AGE_MS = 30 * 1000;

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
  const pathname = usePathname();
  const [alert, setAlert] = useState<RideAlert | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dedup key for the most recently shown alert. Prevents the same cancel
  // event from firing twice if the server publishes both ride_update +
  // status_change in quick succession, or if a stale rewind replay slips
  // past the timestamp gate. Cleared when the alert dismisses.
  const lastAlertKeyRef = useRef<{ key: string; at: number } | null>(null);
  const DEDUP_WINDOW_MS = 60_000;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

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

  const handleMessage = useCallback((msg: { name: string; data: unknown; timestamp?: number }) => {
    // Suppress Ably rewind replays for transient ride-state events. State that
    // moves on its own (otw → here → ended) gets stale fast, so a 30s-old
    // replay would re-fire "Driver is here!" after the ride already ended.
    // booking_declined is exempt: the post sits in declined_awaiting_rider
    // until the rider explicitly cancels or broadcasts, so the rider needs
    // to see it even if they only just opened the app minutes later.
    const isStateEvent = msg.name === 'ride_update' || msg.name === 'status_change'
      || msg.name === 'booking_accepted' || msg.name === 'booking_cancelled';
    if (isStateEvent && msg.timestamp && Date.now() - msg.timestamp > ALERT_MAX_AGE_MS) {
      return;
    }

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
      // If the user is already on /ride/{rideId}, the ride page renders its
      // own per-status notification. Showing the global one too creates a
      // visible duplicate (rider sees "Ride cancelled" twice). Skip — the
      // page surface owns notifications for its own ride.
      if (rideId && pathRef.current?.startsWith(`/ride/${rideId}`)) return;
      if (rideId && status === 'cancelled') {
        const key = `ride_cancelled:${rideId}`;
        const last = lastAlertKeyRef.current;
        if (last && last.key === key && Date.now() - last.at < DEDUP_WINDOW_MS) return;
        lastAlertKeyRef.current = { key, at: Date.now() };
        setAlert({
          type: 'ride_cancelled',
          rideId,
          driverName: (data.driverName as string) || undefined,
          message: (data.message as string) || 'Ride was cancelled',
        });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => setAlert(null), 15000);
      } else if (rideId && ['otw', 'here'].includes(status)) {
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

    // Driver passed on a direct booking. Server publishes this with reason +
    // optional 140-char note. Surface it as a full-screen prompt so the rider
    // can decide (cancel vs broadcast) wherever they are in the app.
    if (msg.name === 'booking_declined') {
      const postId = data.postId as string | undefined;
      if (postId) {
        // Dedup against rewind replays — Ably can replay the same message
        // after the live publish already fired (especially on reconnect).
        // Without this the alert visibly fires twice in quick succession.
        const key = `booking_declined:${postId}`;
        const last = lastAlertKeyRef.current;
        if (last && last.key === key && Date.now() - last.at < DEDUP_WINDOW_MS) return;
        lastAlertKeyRef.current = { key, at: Date.now() };
        const reason = data.reason as RideAlert['reason'];
        setAlert({
          type: 'booking_declined',
          rideId: '',
          postId,
          driverName: (data.driverName as string) || undefined,
          price: data.price ? Number(data.price) : undefined,
          reason: reason ?? null,
          driverMessage: (data.message as string) || null,
        });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        // Longer auto-dismiss than other alerts — rider needs time to read the
        // reason + note before deciding. Pending-action banner persists either way.
        dismissTimer.current = setTimeout(() => setAlert(null), 45000);
      }
    }

    // Booking cancelled by rider (driver side)
    if (msg.name === 'booking_cancelled') {
      setAlert({
        type: 'booking_cancelled',
        rideId: '',
        message: 'Booking request was cancelled by the rider',
      });
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => setAlert(null), 10000);
    }
  }, []);

  useAbly({
    channelName: userId ? `user:${userId}:notify` : null,
    onMessage: handleMessage,
  });

  if (!alert) return null;

  const isAccepted = alert.type === 'booking_accepted';
  const isCancelled = alert.type === 'ride_cancelled' || alert.type === 'booking_cancelled';
  const isDeclined = alert.type === 'booking_declined';
  const reasonLabel = alert.reason ? REASON_LABEL[alert.reason] : null;

  const accentColor = isDeclined
    ? '#FF9100'
    : isCancelled ? '#FF5252' : '#00E676';
  const accentBg = isDeclined
    ? 'rgba(255,145,0,0.15)'
    : isCancelled ? 'rgba(255,82,82,0.15)' : 'rgba(0,230,118,0.15)';

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
        background: accentBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, animation: isCancelled ? 'none' : 'alertPulse 2s ease-in-out infinite',
      }}>
        <span style={{ fontSize: 40 }}>
          {isCancelled ? '\u274C'
            : isDeclined ? '\u{1F914}'
            : isAccepted ? '\u{1F91D}'
            : alert.message?.includes('here') ? '\u{1F4CD}'
            : '\u{1F697}'}
        </span>
      </div>

      {/* Title */}
      <h1 style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 36, color: '#fff', textAlign: 'center',
        lineHeight: 1, marginBottom: 8,
      }}>
        {isCancelled ? 'RIDE CANCELLED'
          : isDeclined ? `${(alert.driverName || 'DRIVER').toUpperCase()} PASSED`
          : isAccepted ? 'RIDE ACCEPTED!'
          : alert.message?.toUpperCase() || 'RIDE UPDATE'}
      </h1>

      {isDeclined && reasonLabel && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 100,
          background: 'rgba(255,145,0,0.14)',
          border: '1px solid rgba(255,145,0,0.35)',
          color: '#FFB366',
          fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
          marginBottom: 12,
        }}>
          {reasonLabel}
        </span>
      )}

      {isDeclined && alert.driverMessage && (
        <p style={{
          fontSize: 14, color: '#fff', fontStyle: 'italic',
          textAlign: 'center', lineHeight: 1.45,
          padding: '12px 16px', maxWidth: 320,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          marginBottom: 14,
        }}>
          &ldquo;{alert.driverMessage}&rdquo;
        </p>
      )}

      {/* Subtitle */}
      <p style={{
        fontSize: 15, color: '#bbb', textAlign: 'center',
        lineHeight: 1.5, marginBottom: 8, maxWidth: 320,
      }}>
        {isCancelled
          ? alert.message || 'This ride has been cancelled. No charge was made.'
          : isDeclined
          ? `Cancel your ${alert.price ? `$${alert.price} ` : ''}ride or blast it to all active drivers?`
          : isAccepted
          ? `${alert.driverName || 'Your driver'} accepted your ride${alert.price ? ` — $${alert.price}` : ''}. Tap below to confirm your pickup.`
          : alert.message || 'Check your ride for updates.'}
      </p>

      {/* CTA */}
      {isCancelled ? (
        <button
          onClick={() => {
            setAlert(null);
            if (dismissTimer.current) clearTimeout(dismissTimer.current);
          }}
          style={{
            width: '100%', maxWidth: 320, padding: 18, borderRadius: 100,
            border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
            color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            marginTop: 16,
          }}
        >
          Got it
        </button>
      ) : isDeclined ? (
        <button
          onClick={() => {
            setAlert(null);
            if (dismissTimer.current) clearTimeout(dismissTimer.current);
            if (alert.postId) router.push(`/rider/posts/${alert.postId}/passed`);
          }}
          style={{
            width: '100%', maxWidth: 320, padding: 18, borderRadius: 100,
            border: 'none', background: accentColor, color: '#080808',
            fontSize: 17, fontWeight: 800, cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            marginTop: 16, animation: 'alertBounce 2s ease-in-out infinite',
          }}
        >
          Decide What&apos;s Next
        </button>
      ) : (
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
      )}

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
