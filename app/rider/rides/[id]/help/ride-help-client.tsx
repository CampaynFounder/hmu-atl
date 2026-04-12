'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface RideInfo {
  id: string;
  refCode: string | null;
  status: string;
  price: number;
  isCash: boolean;
  driverName: string;
  driverHandle: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  createdAt: string;
}

const CATEGORIES = [
  { key: 'payment', label: 'Payment issue', icon: '💳' },
  { key: 'overcharged', label: 'I was overcharged', icon: '💰' },
  { key: 'refund', label: 'I need a refund', icon: '🔄' },
  { key: 'driver_noshow', label: 'Driver didn\'t show up', icon: '👻' },
  { key: 'safety', label: 'Safety concern', icon: '🚨' },
  { key: 'report_driver', label: 'Report driver', icon: '🚩' },
  { key: 'other', label: 'Something else', icon: '💬' },
];

export default function RideHelpClient({ ride }: { ride: RideInfo }) {
  const [category, setCategory] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!category) { setError('Select an issue type'); return; }
    if (!message.trim()) { setError('Describe what happened'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rideId: ride.id,
          category,
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Failed to submit');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div style={{
        background: '#080808', minHeight: '100svh', color: '#fff',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)", paddingTop: '56px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '56px 20px 40px',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>We got your message</div>
        <div style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
          Our team will review your issue and get back to you.
          {ride.refCode && <> Reference: <strong style={{ color: '#00E676' }}>{ride.refCode}</strong></>}
        </div>
        <Link href="/rider/rides" style={{
          padding: '12px 32px', borderRadius: 100, background: '#00E676', color: '#080808',
          fontSize: 14, fontWeight: 700, textDecoration: 'none',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}>
          Back to Rides
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      background: '#080808', minHeight: '100svh', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)", paddingTop: '56px',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 0' }}>
        <Link href="/rider/rides" style={{ color: '#00E676', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Your Rides
        </Link>
      </div>
      <div style={{ padding: '12px 20px 16px' }}>
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 28, lineHeight: 1 }}>
          Get Help
        </div>
      </div>

      {/* Ride context card */}
      <div style={{ margin: '0 20px 16px', padding: '12px 14px', background: '#141414', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{ride.driverName}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#00E676', fontFamily: "'Space Mono', monospace" }}>
            ${ride.price.toFixed(2)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#666' }}>
            {new Date(ride.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {ride.isCash && <span style={{ color: '#FFC107', marginLeft: 6 }}>CASH</span>}
          </span>
          {ride.refCode && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#00E676', fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>
              {ride.refCode}
            </span>
          )}
        </div>
        {(ride.pickupAddress || ride.dropoffAddress) && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
            {ride.pickupAddress && <div>{ride.pickupAddress}</div>}
            {ride.dropoffAddress && <div>→ {ride.dropoffAddress}</div>}
          </div>
        )}
      </div>

      {/* Category selection */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8 }}>What happened?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => { setCategory(c.key); setError(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: category === c.key ? 'rgba(0,230,118,0.08)' : '#141414',
                border: category === c.key ? '1px solid rgba(0,230,118,0.3)' : '1px solid rgba(255,255,255,0.06)',
                color: category === c.key ? '#00E676' : '#ccc',
                fontSize: 14, fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      {category && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8 }}>Tell us more</div>
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setError(null); }}
            placeholder="What happened? Include any details that will help us resolve this..."
            rows={4}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              background: '#141414', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 14, fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              resize: 'none', outline: 'none',
            }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin: '0 20px 12px', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', color: '#FF5252', fontSize: 13, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Submit */}
      {category && (
        <div style={{ padding: '0 20px 40px' }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, border: 'none',
              background: submitting ? '#444' : '#00E676', color: '#080808',
              fontSize: 16, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              letterSpacing: 2, opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}
