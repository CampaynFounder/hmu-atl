'use client';

// Shows the driver's past blast matches — blasts where they were Pull Up'd.
// Excluded: blasts they HMU'd but weren't selected for.
// Collapsed by default; driver taps to expand.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface BlastMatch {
  targetId: string;
  blastId: string;
  rideId: string | null;
  rideStatus: string | null;
  blastStatus: string;
  price: number;
  finalPrice: number | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  riderName: string;
  selectedAt: string;
  pullUpAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

function rideOutcomeLabel(match: BlastMatch): { label: string; color: string } {
  if (!match.rideId) {
    return match.blastStatus === 'cancelled'
      ? { label: 'Blast cancelled', color: '#888' }
      : { label: 'No ride created', color: '#888' };
  }
  const s = match.rideStatus;
  if (s === 'ended' || s === 'completed') return { label: 'Completed', color: '#00E676' };
  if (s === 'cancelled' || s === 'refunded') return { label: 'Cancelled', color: '#FF5252' };
  if (s === 'started') return { label: 'In progress', color: '#FFB300' };
  if (s === 'matched') return { label: 'Matched', color: '#FF6400' };
  return { label: s ?? 'Unknown', color: '#888' };
}

function shortAddress(addr: string | null): string {
  if (!addr) return '—';
  const seg = addr.split(',')[0].trim();
  return seg.length > 22 ? seg.slice(0, 20) + '…' : seg;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DriverBlastMatchHistory({ driverId }: { driverId: string }) {
  const router = useRouter();
  const [matches, setMatches] = useState<BlastMatch[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/driver/blast-matches')
      .then((r) => r.json())
      .then((d: { matches?: BlastMatch[] }) => setMatches(d.matches ?? []))
      .catch(() => setMatches([]));
  }, [driverId]);

  if (matches === null || matches.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: '0 0 12px', cursor: 'pointer', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
            Blast Matches
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, background: 'rgba(255,100,0,0.15)',
            color: '#FF6400', border: '1px solid rgba(255,100,0,0.3)',
            borderRadius: 100, padding: '2px 8px',
          }}>
            {matches.length}
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#555' }}>{expanded ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matches.map((m) => {
            const outcome = rideOutcomeLabel(m);
            const displayPrice = m.finalPrice ?? m.price;
            return (
              <button
                key={m.targetId}
                onClick={() => m.rideId ? router.push(`/ride/${m.rideId}`) : undefined}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: '#141414', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14, padding: '14px 16px',
                  cursor: m.rideId ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    ${displayPrice}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#666' }}>
                      from {m.riderName}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: '#555', flexShrink: 0, marginLeft: 8 }}>
                    {relativeDate(m.selectedAt)}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#888', marginBottom: 8, lineHeight: 1.4 }}>
                  {shortAddress(m.pickupAddress)} → {shortAddress(m.dropoffAddress)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                    background: `${outcome.color}18`, color: outcome.color,
                    border: `1px solid ${outcome.color}30`,
                    textTransform: 'uppercase', letterSpacing: 0.8,
                  }}>
                    {outcome.label}
                  </span>
                  {m.rideId && (
                    <span style={{ fontSize: 10, color: '#555' }}>Tap to view →</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
