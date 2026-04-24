'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Area {
  slug: string;
  name: string;
  cardinal: 'westside' | 'eastside' | 'northside' | 'southside' | 'central';
}

type PassReason = 'price' | 'distance' | 'booked' | 'other';

interface Props {
  postId: string;
  price: number;
  driverName: string;
  passReason: PassReason | null;
  passMessage: string | null;
  pickupSlug: string | null;
  dropoffSlug: string | null;
  areas: Area[];
}

const CARDINAL_ORDER: Area['cardinal'][] = ['central', 'northside', 'eastside', 'southside', 'westside'];
const CARDINAL_LABEL: Record<Area['cardinal'], string> = {
  central: 'Central', northside: 'Northside', eastside: 'Eastside',
  southside: 'Southside', westside: 'Westside',
};

const REASON_LABEL: Record<PassReason, string> = {
  price: 'Price was too low',
  distance: 'Too far / wrong direction',
  booked: 'Already booked',
  other: 'Other',
};

export default function DriverPassedClient({
  postId, price, driverName, passReason, passMessage, pickupSlug, dropoffSlug, areas,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'cancel' | 'broadcast' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickup, setPickup] = useState<string | null>(pickupSlug);
  const [dropoff, setDropoff] = useState<string | null>(dropoffSlug);

  const grouped = CARDINAL_ORDER
    .map(c => ({ cardinal: c, rows: areas.filter(a => a.cardinal === c) }))
    .filter(g => g.rows.length);

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

  const handleBroadcast = async () => {
    setBusy('broadcast'); setError(null);
    try {
      const res = await fetch(`/api/rider/posts/${postId}/broadcast-after-decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_area_slug: pickup, dropoff_area_slug: dropoff }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Broadcast failed');
      clearPendingActionsCache();
      router.replace('/rider/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Broadcast failed');
      setBusy(null);
    }
  };

  return (
    <div style={{
      minHeight: '100svh', background: '#080808', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      padding: '56px 20px 40px',
    }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🤔</div>
        <h1 style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 36, lineHeight: 1.05, marginBottom: 8,
        }}>
          {driverName} passed
        </h1>
        <p style={{ fontSize: 15, color: '#bbb', lineHeight: 1.5, marginBottom: 24 }}>
          No hard feelings. You can cancel, or broadcast your ${price} ride to every nearby driver.
        </p>

        {(passReason || passMessage) && (
          <div style={{
            background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, padding: 14, marginBottom: 24,
          }}>
            {passReason && (
              <div style={{
                display: 'inline-block',
                background: 'rgba(255,107,53,0.14)', color: '#FF6B35',
                padding: '4px 10px', borderRadius: 100,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                marginBottom: passMessage ? 10 : 0,
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

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>
            Pickup area
          </div>
          <AreaPicker value={pickup} onChange={setPickup} grouped={grouped} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>
            Dropoff area <span style={{ textTransform: 'none', letterSpacing: 0, color: '#666' }}>(optional)</span>
          </div>
          <AreaPicker value={dropoff} onChange={setDropoff} grouped={grouped} allowNull />
        </div>

        {error && (
          <div style={{
            padding: 12, borderRadius: 10, background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)', color: '#FF5252',
            fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleBroadcast}
          disabled={!!busy}
          style={{
            width: '100%', padding: 18, borderRadius: 100, border: 'none',
            background: '#00E676', color: '#080808', fontWeight: 700, fontSize: 17,
            cursor: busy ? 'wait' : 'pointer', marginBottom: 10,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === 'broadcast' ? 'Broadcasting…' : `Broadcast $${price} ride`}
        </button>

        <button
          onClick={handleCancel}
          disabled={!!busy}
          style={{
            width: '100%', padding: 18, borderRadius: 100,
            background: 'transparent', color: '#bbb', fontSize: 15, fontWeight: 600,
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel the ride'}
        </button>
      </div>
    </div>
  );
}

function AreaPicker({
  value, onChange, grouped, allowNull,
}: {
  value: string | null;
  onChange: (slug: string | null) => void;
  grouped: { cardinal: Area['cardinal']; rows: Area[] }[];
  allowNull?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {allowNull && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="Not sure" active={value === null} onClick={() => onChange(null)} />
        </div>
      )}
      {grouped.map(g => (
        <div key={g.cardinal}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: '#666', textTransform: 'uppercase', marginBottom: 6 }}>
            {CARDINAL_LABEL[g.cardinal]}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {g.rows.map(a => (
              <Chip
                key={a.slug}
                label={a.name}
                active={value === a.slug}
                onClick={() => onChange(a.slug)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 100, fontSize: 13, fontWeight: 600,
        border: `1px solid ${active ? '#00E676' : 'rgba(255,255,255,0.12)'}`,
        background: active ? 'rgba(0,230,118,0.15)' : '#141414',
        color: active ? '#00E676' : '#ddd',
        cursor: 'pointer',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      {label}
    </button>
  );
}
