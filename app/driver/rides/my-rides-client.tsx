'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface Ride {
  id: string;
  status: string;
  riderName: string;
  price: number;
  destination: string;
  payout: number;
  platformFee: number;
  rating: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

interface Props {
  rides: Ride[];
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  matched: { label: 'Matched', color: '#448AFF', bg: 'rgba(68,138,255,0.1)' },
  otw: { label: 'OTW', color: '#00E676', bg: 'rgba(0,230,118,0.1)' },
  here: { label: 'HERE', color: '#00E676', bg: 'rgba(0,230,118,0.1)' },
  active: { label: 'Active', color: '#FFD740', bg: 'rgba(255,215,64,0.1)' },
  ended: { label: 'Ended', color: '#888', bg: 'rgba(255,255,255,0.05)' },
  completed: { label: 'Completed', color: '#00E676', bg: 'rgba(0,230,118,0.1)' },
  cancelled: { label: 'Cancelled', color: '#FF5252', bg: 'rgba(255,82,82,0.1)' },
  disputed: { label: 'Disputed', color: '#FF9100', bg: 'rgba(255,145,0,0.1)' },
};

const RATING_EMOJI: Record<string, string> = {
  chill: '\u2705', cool_af: '\uD83D\uDE0E', kinda_creepy: '\uD83D\uDC40', weirdo: '\uD83D\uDEA9',
};

export default function MyRidesClient({ rides }: Props) {
  const [filter, setFilter] = useState('');

  const filtered = rides.filter(r => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return r.riderName.toLowerCase().includes(q)
      || r.destination.toLowerCase().includes(q)
      || r.status.includes(q)
      || new Date(r.createdAt).toLocaleDateString().includes(q);
  });

  return (
    <div style={{
      background: '#080808', minHeight: '100svh', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)", paddingTop: '56px',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Link href="/driver/home" style={{ color: '#00E676', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '14px', fontWeight: 600 }}>
          <ChevronLeft style={{ width: '16px', height: '16px' }} /> Home
        </Link>
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: '28px', flex: 1, textAlign: 'center', paddingRight: '60px' }}>
          My Rides
        </div>
      </div>

      {/* Search/Filter */}
      <div style={{ padding: '16px 20px' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by rider, destination, date..."
          style={{
            width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '100px', padding: '14px 20px', color: '#fff', fontSize: '14px',
            outline: 'none', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '10px', padding: '0 20px 16px' }}>
        <div style={{ flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: '24px', color: '#00E676' }}>
            {rides.length}
          </div>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Total</div>
        </div>
        <div style={{ flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: '24px', color: '#00E676' }}>
            ${rides.reduce((s, r) => s + r.payout, 0).toFixed(0)}
          </div>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Earned</div>
        </div>
        <div style={{ flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: '24px', color: '#00E676' }}>
            {rides.filter(r => r.status === 'completed').length}
          </div>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Done</div>
        </div>
      </div>

      {/* Ride list */}
      <div style={{ padding: '0 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.4 }}>{'\uD83D\uDE97'}</div>
            <div style={{ fontSize: '15px', color: '#888' }}>
              {filter ? 'No rides match your search' : 'No rides yet — accept a request to get started'}
            </div>
          </div>
        ) : (
          filtered.map((ride) => {
            const st = STATUS_LABELS[ride.status] || { label: ride.status, color: '#888', bg: 'rgba(255,255,255,0.05)' };
            return (
              <Link key={ride.id} href={`/ride/${ride.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '16px', padding: '16px', marginBottom: '10px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>{ride.riderName}</span>
                    <span style={{ fontSize: '11px', background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '100px', fontWeight: 600 }}>
                      {st.label}
                    </span>
                  </div>

                  {ride.destination && (
                    <div style={{ fontSize: '14px', color: '#bbb', marginBottom: '8px', lineHeight: 1.4 }}>
                      {ride.destination}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: '#888' }}>
                      <span>{new Date(ride.createdAt).toLocaleDateString()}</span>
                      {ride.rating && <span>{RATING_EMOJI[ride.rating] || ''} {ride.rating}</span>}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                      fontSize: '22px', color: '#00E676',
                    }}>
                      ${ride.price}
                    </div>
                  </div>

                  {ride.payout > 0 && (
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
                      You kept ${ride.payout.toFixed(2)} · HMU took ${ride.platformFee.toFixed(2)}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
