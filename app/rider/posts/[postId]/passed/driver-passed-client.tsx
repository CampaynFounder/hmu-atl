'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type PassReason = 'price' | 'distance' | 'booked' | 'other';

interface Props {
  postId: string;
  price: number;
  driverName: string;
  passReason: PassReason | null;
  passMessage: string | null;
  pickupName: string | null;
  dropoffName: string | null;
  destinationText: string | null;
  timeText: string | null;
}

const REASON_LABEL: Record<PassReason, string> = {
  price: 'Price was too low',
  distance: 'Too far / wrong direction',
  booked: 'Already booked',
  other: 'Other',
};

export default function DriverPassedClient({
  postId, price, driverName, passReason, passMessage,
  pickupName, dropoffName, destinationText, timeText,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'cancel' | 'broadcast' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drop the pending-actions localStorage cache before nav so the rider
  // feed banner doesn't hydrate with the stale driver_passed entry while
  // the silent on-mount refetch is still in flight.
  const clearPendingActionsCache = () => {
    try { localStorage.removeItem('hmu_pending_actions'); } catch { /* ignore */ }
  };

  const handleCancel = async () => {
    setBusy('cancel'); setError(null);
    try {
      const res = await fetch(`/api/rider/posts/${postId}/cancel-after-decline`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Cancel failed');
      clearPendingActionsCache();
      router.replace('/rider/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
      setBusy(null);
    }
  };

  // "HMU" in the UI = broadcast in the data model. Keeping the original
  // pickup/dropoff slugs from the post — no in-page widening control,
  // since the request was for stop-scrolling-and-just-decide UX.
  const handleHmu = async () => {
    setBusy('broadcast'); setError(null);
    try {
      const res = await fetch(`/api/rider/posts/${postId}/broadcast-after-decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HMU failed');
      clearPendingActionsCache();
      router.replace('/rider/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'HMU failed');
      setBusy(null);
    }
  };

  // Resolve pickup + dropoff to show as separate rows. Prefer slug-resolved
  // names (server already mapped them). Fall back to parsing the rider's
  // free-text destination, which our booking flow expects to be "X > Y" /
  // "X to Y" / "X → Y" — same syntax the area parser ingests on the way in.
  const { pickupDisplay, dropoffDisplay } = (() => {
    if (pickupName && dropoffName) {
      return { pickupDisplay: pickupName, dropoffDisplay: dropoffName };
    }
    if (destinationText) {
      const split = destinationText.split(/\s*(?:>|→|->|\bto\b)\s*/i).filter(Boolean);
      if (split.length >= 2) {
        return { pickupDisplay: pickupName ?? split[0], dropoffDisplay: dropoffName ?? split[1] };
      }
      // Single-segment destination — treat as dropoff only, leave pickup blank.
      return { pickupDisplay: pickupName, dropoffDisplay: dropoffName ?? destinationText };
    }
    return { pickupDisplay: pickupName, dropoffDisplay: dropoffName };
  })();

  return (
    <div style={{
      minHeight: '100svh', background: '#080808', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      padding: '56px 20px 28px',
    }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ fontSize: 44, marginBottom: 8 }}>🤔</div>
        <h1 style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 32, lineHeight: 1.05, margin: 0, marginBottom: 6,
        }}>
          {driverName} passed
        </h1>
        <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.4, margin: 0, marginBottom: 18 }}>
          HMU all active drivers, or cancel.
        </p>

        {/* Driver response */}
        {(passReason || passMessage) && (
          <div style={{
            background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, padding: 14, marginBottom: 14,
          }}>
            {passReason && (
              <div style={{
                display: 'inline-block',
                background: 'rgba(255,107,53,0.14)', color: '#FF6B35',
                padding: '4px 10px', borderRadius: 100,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                marginBottom: passMessage ? 8 : 0,
              }}>
                {REASON_LABEL[passReason]}
              </div>
            )}
            {passMessage && (
              <div style={{ fontSize: 14, color: '#ddd', lineHeight: 1.5 }}>
                &ldquo;{passMessage}&rdquo;
              </div>
            )}
          </div>
        )}

        {/* Ride details — keep this compact so HMU/Cancel land near the top */}
        <div style={{
          background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: '14px 16px', marginBottom: 18,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <DetailRow label="Pickup" value={pickupDisplay || 'Not specified'} />
          <DetailRow label="Dropoff" value={dropoffDisplay || 'Not specified'} />
          {timeText && (
            <DetailRow label="When" value={timeText} />
          )}
          <DetailRow
            label="Price"
            value={
              <span style={{
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                fontSize: 22, color: '#00E676', lineHeight: 1,
              }}>
                ${price}
              </span>
            }
          />
        </div>

        {error && (
          <div style={{
            padding: 10, borderRadius: 10, background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)', color: '#FF5252',
            fontSize: 13, marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {/* Primary: HMU (broadcast) */}
        <button
          onClick={handleHmu}
          disabled={!!busy}
          style={{
            width: '100%', padding: 18, borderRadius: 100, border: 'none',
            background: '#00E676', color: '#080808', fontWeight: 800, fontSize: 17,
            cursor: busy ? 'wait' : 'pointer', marginBottom: 10,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            opacity: busy ? 0.6 : 1,
            letterSpacing: 0.5,
          }}
        >
          {busy === 'broadcast' ? 'HMU…' : `OTHER DRIVERS HMU · $${price}`}
        </button>

        {/* Secondary: Cancel */}
        <button
          onClick={handleCancel}
          disabled={!!busy}
          style={{
            width: '100%', padding: 16, borderRadius: 100,
            background: 'transparent', color: '#bbb', fontSize: 14, fontWeight: 600,
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel Ride Request'}
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16,
    }}>
      <span style={{
        fontSize: 11, color: '#888',
        textTransform: 'uppercase', letterSpacing: 1.5,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 14, color: '#fff', fontWeight: 500,
        textAlign: 'right',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        minWidth: 0,
      }}>
        {value}
      </span>
    </div>
  );
}
