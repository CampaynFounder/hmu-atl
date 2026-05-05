'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAbly } from '@/hooks/use-ably';
import { posthog } from '@/components/analytics/posthog-provider';

interface Props {
  handle: string;
  driverDisplayName: string;
  userId: string;
  postId: string | null;
  expiresAt: string | null;
  price: number | null;
  destination: string | null;
  initialStatus: string | null;
}

export default function BookingSentClient({
  handle, driverDisplayName, userId, postId, expiresAt, price, destination, initialStatus,
}: Props) {
  const status = initialStatus;
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Subscribe to user notify channel so the moment the driver accepts, we
  // jump straight to the ride page — same pattern rider/home uses.
  const handleAblyMessage = useCallback((msg: { name: string; data: unknown; timestamp?: number }) => {
    if (msg.timestamp && Date.now() - msg.timestamp > 30 * 1000) return;
    const data = msg.data as Record<string, unknown>;
    const msgStatus = (data.status as string | undefined) || null;
    const isMatch =
      msg.name === 'booking_accepted' ||
      (msg.name === 'ride_update' && (msgStatus === 'matched' || msgStatus === 'accepted'));
    if (!isMatch) return;
    const rideId = data.rideId as string;
    if (rideId) {
      posthog.capture('booking_sent_auto_redirect', { handle, rideId });
      window.location.replace(`/ride/${rideId}`);
    }
  }, [handle]);

  useAbly({
    channelName: userId ? `user:${userId}:notify` : null,
    onMessage: handleAblyMessage,
  });

  // Poll once on mount in case the accept landed before this page mounted.
  useEffect(() => {
    if (!postId || status === 'matched') return;
    fetch('/api/rides/active', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d?.hasActiveRide && d?.rideId) {
          window.location.replace(`/ride/${d.rideId}`);
        }
      })
      .catch(() => {});
  }, [postId, status]);

  async function handleCancel() {
    if (!confirm(`Cancel your request to ${driverDisplayName}?`)) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/drivers/${handle}/book`, { method: 'DELETE' });
      if (res.ok) {
        posthog.capture('booking_sent_cancelled', { handle });
        window.location.href = '/rider/browse?cancelled=1';
        return;
      }
      const data = await res.json().catch(() => ({}));
      setCancelError(data.error || 'Failed to cancel');
    } catch {
      setCancelError('Network error');
    }
    setCancelling(false);
  }

  return (
    <div style={{
      minHeight: '100svh',
      background: '#080808',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
    }}>
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 6 }}>{'✅'}</div>
        <div style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 32, color: '#00E676', marginBottom: 8, lineHeight: 1.05,
          letterSpacing: 0.5,
        }}>
          SENT TO {driverDisplayName.toUpperCase()}
        </div>

        {(price !== null || destination) && (
          <div style={{
            display: 'inline-block',
            padding: '8px 16px', borderRadius: 100,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 13, color: '#ccc', marginBottom: 16,
          }}>
            {price !== null ? `$${price}` : ''}
            {price !== null && destination ? ' · ' : ''}
            {destination || ''}
          </div>
        )}

        {expiresAt ? (
          <ExpiryCountdown expiresAt={expiresAt} driverName={driverDisplayName} />
        ) : (
          <div style={{ fontSize: 14, color: '#888', marginBottom: 22, lineHeight: 1.5 }}>
            They have 15 min to accept. We&apos;ll notify you the moment they do.
          </div>
        )}

        <div style={{
          background: '#141414', borderRadius: 16, padding: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'left', marginBottom: 22, fontSize: 13, color: '#bbb', lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>📲</span>
            <span>
              <strong style={{ color: '#fff' }}>You&apos;re good.</strong> {driverDisplayName} just
              got the request via SMS + push. We&apos;ll send you a notification the second
              they accept and route you to the ride.
            </span>
          </div>
        </div>

        {cancelError && (
          <div style={{
            fontSize: 12, color: '#FF5252', padding: '6px 10px',
            background: 'rgba(255,82,82,0.08)', borderRadius: 8, marginBottom: 12,
          }}>
            {cancelError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link
            href="/rider/home"
            style={{
              display: 'block', padding: '14px 18px', borderRadius: 100,
              background: '#00E676', color: '#080808',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            Go to my rides
          </Link>
          <Link
            href="/rider/browse"
            style={{
              display: 'block', padding: '12px 18px', borderRadius: 100,
              border: '1px solid rgba(255,255,255,0.14)', background: 'transparent',
              color: '#fff', fontWeight: 600, fontSize: 13, textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            Browse other drivers
          </Link>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              padding: 10, borderRadius: 100, border: 'none', background: 'transparent',
              color: cancelling ? '#444' : '#888', fontSize: 12, fontWeight: 500,
              cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {cancelling ? 'Cancelling…' : 'Cancel request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpiryCountdown({ expiresAt, driverName }: { expiresAt: string; driverName: string }) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const tick = () => {
      setRemainingMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const expired = remainingMs <= 0;
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const label = expired ? 'Expired' : `${mins}:${String(secs).padStart(2, '0')}`;
  const accent = expired ? '#FF5252' : remainingMs < 2 * 60 * 1000 ? '#FF9100' : '#00E676';

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 100,
        background: `${accent}1A`, border: `1px solid ${accent}4D`,
        fontFamily: "'Space Mono', monospace",
        fontSize: 18, fontWeight: 700, color: accent,
        letterSpacing: 1,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: accent,
          animation: expired ? 'none' : 'bookingPulse 1.2s ease-in-out infinite',
        }} />
        {label}
      </div>
      <style>{`@keyframes bookingPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
      <div style={{ fontSize: 13, color: '#888', marginTop: 8, lineHeight: 1.5 }}>
        {expired
          ? `${driverName} didn't respond in time. Try another driver.`
          : `Time left for ${driverName} to accept.`}
      </div>
    </div>
  );
}
