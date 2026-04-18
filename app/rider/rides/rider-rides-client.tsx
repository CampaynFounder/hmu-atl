'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface Ride {
  id: string;
  refCode: string | null;
  status: string;
  price: number;
  isCash: boolean;
  driverName: string;
  driverHandle: string | null;
  driverAvatar: string | null;
  driverRating: string | null;
  riderRating: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  disputeWindowExpiresAt: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  matched: { label: 'Matched', color: '#448AFF', bg: 'rgba(68,138,255,0.1)' },
  otw: { label: 'OTW', color: '#FF9100', bg: 'rgba(255,145,0,0.1)' },
  here: { label: 'Here', color: '#FFD740', bg: 'rgba(255,215,64,0.1)' },
  confirming: { label: 'Confirming', color: '#FF9100', bg: 'rgba(255,145,0,0.1)' },
  active: { label: 'Active', color: '#00E676', bg: 'rgba(0,230,118,0.1)' },
  ended: { label: 'Ended', color: '#888', bg: 'rgba(255,255,255,0.05)' },
  completed: { label: 'Completed', color: '#00E676', bg: 'rgba(0,230,118,0.1)' },
  cancelled: { label: 'Cancelled', color: '#FF5252', bg: 'rgba(255,82,82,0.1)' },
  disputed: { label: 'Disputed', color: '#FF9100', bg: 'rgba(255,145,0,0.1)' },
};

const RATING_EMOJI: Record<string, string> = {
  chill: '\u2705', cool_af: '\uD83D\uDE0E', kinda_creepy: '\uD83D\uDC40', weirdo: '\uD83D\uDEA9',
};

const ACTIVE_STATUSES = ['matched', 'otw', 'here', 'confirming', 'active'];

export default function RiderRidesClient({ rides }: { rides: Ride[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const activeRides = rides.filter(r => ACTIVE_STATUSES.includes(r.status));
  const pastRides = rides.filter(r => !ACTIVE_STATUSES.includes(r.status));

  async function handleCancel(ride: Ride) {
    if (!confirm(`Cancel this ride with ${ride.driverName}? Any payment hold will be released.`)) return;
    setCancellingId(ride.id);
    setCancelError(null);
    try {
      const res = await fetch(`/api/rides/${ride.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(data.error || `Failed (${res.status})`);
        setCancellingId(null);
        return;
      }
      window.location.reload();
    } catch {
      setCancelError('Network error');
      setCancellingId(null);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function canDispute(ride: Ride): boolean {
    if (!ride.disputeWindowExpiresAt) return false;
    return new Date(ride.disputeWindowExpiresAt).getTime() > Date.now();
  }

  function renderRide(ride: Ride) {
    const st = STATUS_LABELS[ride.status] || { label: ride.status, color: '#888', bg: 'rgba(255,255,255,0.05)' };
    const expanded = expandedId === ride.id;

    return (
      <div key={ride.id} style={{
        background: '#141414', borderRadius: 14,
        border: expanded ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden', transition: 'border-color 0.2s',
      }}>
        {/* Summary row */}
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : ride.id)}
          style={{
            width: '100%', padding: '14px 16px', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          {/* Driver avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {ride.driverAvatar
              ? <img src={ride.driverAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 16, color: '#666' }}>🚗</span>
            }
          </div>
          {/* Info */}
          <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
              {ride.driverName}
              {ride.driverHandle && <span style={{ fontSize: 11, color: '#666', fontWeight: 400 }}>@{ride.driverHandle}</span>}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ride.dropoffAddress || ride.pickupAddress || 'Ride'}
            </div>
          </div>
          {/* Price + status */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#00E676', fontFamily: "'Space Mono', monospace" }}>
              ${ride.price.toFixed(2)}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: st.color, background: st.bg,
              padding: '2px 8px', borderRadius: 100, marginTop: 2, display: 'inline-block',
            }}>
              {st.label}
            </div>
          </div>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Ref code + date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 8px' }}>
              {ride.refCode && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#00E676', fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>
                  {ride.refCode}
                </span>
              )}
              <span style={{ fontSize: 11, color: '#666' }}>
                {formatDate(ride.createdAt)} {formatTime(ride.createdAt)}
              </span>
            </div>

            {/* Route */}
            {(ride.pickupAddress || ride.dropoffAddress) && (
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8, lineHeight: 1.5 }}>
                {ride.pickupAddress && <div><span style={{ color: '#22c55e', fontWeight: 700, fontSize: 10 }}>PICKUP</span> {ride.pickupAddress}</div>}
                {ride.dropoffAddress && <div><span style={{ color: '#ef4444', fontWeight: 700, fontSize: 10 }}>DROP</span> {ride.dropoffAddress}</div>}
              </div>
            )}

            {/* Cash badge */}
            {ride.isCash && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FFC107', background: 'rgba(255,193,7,0.15)', padding: '2px 8px', borderRadius: 100 }}>
                CASH
              </span>
            )}

            {/* Rating you gave */}
            {ride.driverRating && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                You rated: {RATING_EMOJI[ride.driverRating] || ''} {ride.driverRating.replace('_', ' ')}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {/* Active ride — go to ride page */}
              {ACTIVE_STATUSES.includes(ride.status) && (
                <Link href={`/ride/${ride.id}`} style={{
                  flex: 1, padding: '10px', borderRadius: 100, textAlign: 'center',
                  background: '#00E676', color: '#080808', fontSize: 13, fontWeight: 700,
                  textDecoration: 'none', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}>
                  Go to Ride
                </Link>
              )}

              {/* Cancel — only while still matched (pre-OTW). Post-OTW cancel
                  needs driver agreement and happens on the ride detail page. */}
              {ride.status === 'matched' && (
                <button
                  type="button"
                  onClick={() => handleCancel(ride)}
                  disabled={cancellingId === ride.id}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 100, textAlign: 'center',
                    background: 'transparent', border: '1px solid rgba(255,82,82,0.3)',
                    color: '#FF5252', fontSize: 13, fontWeight: 600,
                    cursor: cancellingId === ride.id ? 'not-allowed' : 'pointer',
                    opacity: cancellingId === ride.id ? 0.5 : 1,
                    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                  }}
                >
                  {cancellingId === ride.id ? 'Cancelling...' : 'Cancel'}
                </button>
              )}

              {/* Dispute — if window is still open */}
              {ride.status === 'ended' && canDispute(ride) && (
                <Link href={`/ride/${ride.id}`} style={{
                  flex: 1, padding: '10px', borderRadius: 100, textAlign: 'center',
                  background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)',
                  color: '#FF5252', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}>
                  Dispute
                </Link>
              )}

              {/* Get Help — always available for completed/ended/cancelled/disputed rides */}
              {!ACTIVE_STATUSES.includes(ride.status) && (
                <Link href={`/rider/rides/${ride.id}/help`} style={{
                  flex: 1, padding: '10px', borderRadius: 100, textAlign: 'center',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#aaa', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}>
                  Get Help
                </Link>
              )}
            </div>
            {cancelError && cancellingId === ride.id && (
              <div style={{ fontSize: 12, color: '#FF5252', marginTop: 6, textAlign: 'center' }}>{cancelError}</div>
            )}
          </div>
        )}
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
        <Link href="/rider/home" style={{ color: '#00E676', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Home
        </Link>
      </div>
      <div style={{ padding: '12px 20px 16px' }}>
        <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 32, lineHeight: 1 }}>
          Your Rides
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          {rides.length} ride{rides.length !== 1 ? 's' : ''} total
        </div>
      </div>

      {/* Active rides section */}
      {activeRides.length > 0 && (
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00E676', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Active Now
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeRides.map(renderRide)}
          </div>
        </div>
      )}

      {/* Past rides */}
      <div style={{ padding: '0 20px 32px' }}>
        {activeRides.length > 0 && pastRides.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Past Rides
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pastRides.map(renderRide)}
        </div>
        {rides.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚗</div>
            <div style={{ fontSize: 14 }}>No rides yet</div>
            <Link href="/rider/home" style={{ color: '#00E676', fontSize: 13, marginTop: 8, display: 'inline-block', textDecoration: 'none' }}>
              Find a ride
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
