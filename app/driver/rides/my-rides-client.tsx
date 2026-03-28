'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import DealPill from '@/components/driver/deal-pill';

interface Ride {
  id: string;
  status: string;
  riderName: string;
  riderHandle: string | null;
  price: number;
  destination: string;
  pickup: string;
  dropoff: string;
  payout: number;
  platformFee: number;
  stripeFee: number;
  waivedFee: number;
  addOnTotal: number;
  isCash: boolean;
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
  otw: { label: 'OTW', color: '#FF9100', bg: 'rgba(255,145,0,0.1)' },
  here: { label: 'HERE', color: '#FFD740', bg: 'rgba(255,215,64,0.1)' },
  confirming: { label: 'Confirming', color: '#FF9100', bg: 'rgba(255,145,0,0.1)' },
  active: { label: 'Ride Active', color: '#00E676', bg: 'rgba(0,230,118,0.1)' },
  ended: { label: 'Ended', color: '#888', bg: 'rgba(255,255,255,0.05)' },
  completed: { label: 'Completed', color: '#00E676', bg: 'rgba(0,230,118,0.1)' },
  cancelled: { label: 'Cancelled', color: '#FF5252', bg: 'rgba(255,82,82,0.1)' },
  disputed: { label: 'Disputed', color: '#FF9100', bg: 'rgba(255,145,0,0.1)' },
  refunded: { label: 'Refunded', color: '#FF5252', bg: 'rgba(255,82,82,0.1)' },
};

const ACTIVE_STATUSES = ['matched', 'otw', 'here', 'confirming', 'active'];

const RATING_EMOJI: Record<string, string> = {
  chill: '\u2705', cool_af: '\uD83D\uDE0E', kinda_creepy: '\uD83D\uDC40', weirdo: '\uD83D\uDEA9',
};

export default function MyRidesClient({ rides }: Props) {
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = rides.filter(r => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return r.riderName.toLowerCase().includes(q)
      || r.destination.toLowerCase().includes(q)
      || r.status.includes(q)
      || new Date(r.createdAt).toLocaleDateString().includes(q);
  });

  const completedRides = rides.filter(r => r.status === 'completed');
  const totalEarned = completedRides.reduce((s, r) => s + r.payout, 0);
  const totalFees = completedRides.reduce((s, r) => s + r.platformFee, 0);

  return (
    <div style={{
      background: '#080808', minHeight: '100svh', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)", paddingTop: '56px',
    }}>
      <div style={{ padding: '16px 20px 0' }}><DealPill /></div>

      {/* Header */}
      <div style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Link href="/driver/home" style={{ color: '#00E676', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '14px', fontWeight: 600 }}>
          <ChevronLeft style={{ width: '16px', height: '16px' }} /> Home
        </Link>
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: '28px', flex: 1, textAlign: 'center', paddingRight: '60px' }}>
          My Rides
        </div>
      </div>

      {/* Search */}
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
      <div style={{ display: 'flex', gap: '8px', padding: '0 20px 16px' }}>
        <StatBox label="Total" value={String(rides.length)} />
        <StatBox label="Completed" value={String(completedRides.length)} color="#00E676" />
        <StatBox label="Earned" value={`$${totalEarned.toFixed(0)}`} color="#00E676" />
        <StatBox label="Fees" value={`$${totalFees.toFixed(0)}`} color="#888" />
      </div>

      {/* Active rides */}
      {rides.filter(r => ACTIVE_STATUSES.includes(r.status)).length > 0 && (
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{
            fontSize: 11, color: '#00E676', fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', marginBottom: 8,
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          }}>
            Active Now
          </div>
          {rides.filter(r => ACTIVE_STATUSES.includes(r.status)).map(ride => (
            <ActiveRideCard key={ride.id} ride={ride} />
          ))}
        </div>
      )}

      {/* Ride list */}
      <div style={{ padding: '0 20px 40px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.4 }}>{'\uD83D\uDE97'}</div>
            <div style={{ fontSize: '15px', color: '#888' }}>
              {filter ? 'No rides match your search' : 'No rides yet — accept a request to get started'}
            </div>
          </div>
        ) : (
          filtered.filter(r => !ACTIVE_STATUSES.includes(r.status)).map(ride => (
            <RideCard
              key={ride.id}
              ride={ride}
              expanded={expandedId === ride.id}
              onToggle={() => setExpandedId(expandedId === ride.id ? null : ride.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 6px', textAlign: 'center' }}>
      <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 22, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ActiveRideCard({ ride }: { ride: Ride }) {
  const st = STATUS_LABELS[ride.status] || { label: ride.status, color: '#888', bg: 'rgba(255,255,255,0.05)' };
  return (
    <Link href={`/ride/${ride.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: '#141414', border: '1px solid rgba(0,230,118,0.25)',
        borderRadius: 16, padding: 16, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{ride.riderName}</span>
          <span style={{
            fontSize: 11, background: st.bg, color: st.color,
            padding: '3px 10px', borderRadius: 100, fontWeight: 600,
          }}>
            {st.label}
          </span>
        </div>
        {ride.destination && <div style={{ fontSize: 14, color: '#bbb', marginBottom: 8 }}>{ride.destination}</div>}
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 22, color: '#00E676' }}>
          ${(ride.price + ride.addOnTotal).toFixed(2)}
        </div>
      </div>
    </Link>
  );
}

function RideCard({ ride, expanded, onToggle }: { ride: Ride; expanded: boolean; onToggle: () => void }) {
  const st = STATUS_LABELS[ride.status] || { label: ride.status, color: '#888', bg: 'rgba(255,255,255,0.05)' };
  const rideTotal = ride.price + ride.addOnTotal;
  const date = new Date(ride.createdAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div
      onClick={onToggle}
      style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 16, marginBottom: 10, cursor: 'pointer',
        transition: 'border-color 0.15s',
        ...(expanded ? { borderColor: 'rgba(0,230,118,0.2)' } : {}),
      }}
    >
      {/* Top row: rider + status + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{ride.riderName}</span>
          {ride.rating && <span style={{ fontSize: 14 }}>{RATING_EMOJI[ride.rating] || ''}</span>}
          {ride.isCash && <span style={{ fontSize: 10, color: '#4CAF50', fontWeight: 700, background: 'rgba(76,175,80,0.1)', padding: '2px 6px', borderRadius: 100 }}>CASH</span>}
        </div>
        <span style={{ fontSize: 11, background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 100, fontWeight: 600 }}>
          {st.label}
        </span>
      </div>

      {/* Destination + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        {ride.destination && <div style={{ fontSize: 13, color: '#bbb', flex: 1, lineHeight: 1.3 }}>{ride.destination}</div>}
        <div style={{ fontSize: 12, color: '#555', flexShrink: 0, marginLeft: 8 }}>{dateStr} {timeStr}</div>
      </div>

      {/* Price summary row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#888' }}>
          {ride.payout > 0
            ? `You kept $${ride.payout.toFixed(2)}`
            : ride.status === 'cancelled' ? 'Cancelled' : ''}
        </div>
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 22, color: '#00E676' }}>
          ${rideTotal.toFixed(2)}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Trip details */}
          {(ride.pickup || ride.dropoff) && (
            <div style={{ marginBottom: 12 }}>
              {ride.pickup && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#00E676' }}>A</span>
                  <span style={{ fontSize: 12, color: '#bbb' }}>{ride.pickup}</span>
                </div>
              )}
              {ride.dropoff && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#FF5252' }}>B</span>
                  <span style={{ fontSize: 12, color: '#bbb' }}>{ride.dropoff}</span>
                </div>
              )}
            </div>
          )}

          {/* Financial breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Row label="Base fare" value={`$${ride.price.toFixed(2)}`} />
            {ride.addOnTotal > 0 && <Row label="Add-ons" value={`+$${ride.addOnTotal.toFixed(2)}`} color="#00E676" />}
            <Row label="Ride total" value={`$${rideTotal.toFixed(2)}`} bold />
            {ride.stripeFee > 0 && <Row label="Stripe processing" value={`-$${ride.stripeFee.toFixed(2)}`} color="#FF5252" />}
            {ride.platformFee > 0 && <Row label="HMU platform fee" value={`-$${ride.platformFee.toFixed(2)}`} color="#FF5252" />}
            {ride.waivedFee > 0 && <Row label="Launch Offer savings" value={`$${ride.waivedFee.toFixed(2)}`} color="#00E676" />}
            {ride.payout > 0 && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4, paddingTop: 4 }} />
                <Row label="You kept" value={`$${ride.payout.toFixed(2)}`} bold color="#00E676" />
              </>
            )}
          </div>

          {/* Timestamps */}
          <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11, color: '#555' }}>
            {ride.startedAt && <span>Started {new Date(ride.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
            {ride.endedAt && <span>Ended {new Date(ride.endedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
          </div>

          {/* View ride link */}
          <Link
            href={`/ride/${ride.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'block', textAlign: 'center', marginTop: 12,
              padding: '10px', borderRadius: 100,
              border: '1px solid rgba(0,230,118,0.2)', background: 'transparent',
              color: '#00E676', fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            View Ride
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#888', fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 13, color: color || '#fff', fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}
