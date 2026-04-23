'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAbly } from '@/hooks/use-ably';
import CelebrationConfetti from '@/components/shared/celebration-confetti';

interface MaskedRider {
  id: string;
  handle: string;
  homeAreas: string[];
  avatarUrl: string | null;
}

interface Props {
  riders: MaskedRider[];
  sentToday: number;
  dailyLimit: number | null;
  driverId: string;
  activeRideBanner?: React.ReactNode;
}

export default function FindRidersClient({ riders, sentToday: initialSent, dailyLimit, driverId, activeRideBanner }: Props) {
  const [list, setList] = useState(riders);
  const [sentToday, setSentToday] = useState(initialSent);
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [celebrateRiderId, setCelebrateRiderId] = useState<string | null>(null);

  const atCap = dailyLimit !== null && sentToday >= dailyLimit;

  // Subscribe to driver's personal notify channel for `hmu_linked` events — when a
  // rider on the other side taps Link on one of our HMUs, their id surfaces here.
  // We fire celebration confetti (via CSS burst for now; see confetti-rework merge note)
  // and mark the card briefly before it falls off on the next reload.
  useAbly({
    channelName: `user:${driverId}:notify`,
    onMessage: (msg) => {
      if (msg.name !== 'hmu_linked') return;
      const data = msg.data as { riderId?: string };
      if (!data?.riderId) return;
      setCelebrateRiderId(data.riderId);
      setToast('A rider linked with you!');
      window.setTimeout(() => setCelebrateRiderId(null), 3000);
      window.setTimeout(() => setToast(null), 4000);
    },
  });

  const handleHmu = useCallback(async (riderId: string) => {
    if (sending) return;
    if (atCap) {
      setToast('Daily cap reached — come back tomorrow.');
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    setSending(riderId);
    try {
      const res = await fetch('/api/driver/hmu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId }),
      });
      if (res.ok) {
        setList((prev) => prev.filter((r) => r.id !== riderId));
        setSentToday((n) => n + 1);
        setToast('HMU sent');
      } else if (res.status === 429) {
        setToast('Daily cap reached — come back tomorrow.');
      } else if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        setToast(body.error === 'blocked' ? 'You can’t HMU this rider.' : 'Not allowed.');
      } else if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setToast(body.error === 'not_present' ? 'Go live first to send HMUs.' : 'Not allowed.');
      } else {
        setToast('Something went wrong.');
      }
    } catch {
      setToast('Network error.');
    } finally {
      setSending(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  }, [sending, atCap]);

  const capDisplay = useMemo(() => {
    if (dailyLimit === null) return `${sentToday} sent today`;
    return `${sentToday}/${dailyLimit} today`;
  }, [sentToday, dailyLimit]);

  return (
    <div
      style={{
        background: '#080808',
        color: '#fff',
        minHeight: '100svh',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        padding: '72px 20px 40px',
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes glow { 0% { box-shadow: 0 0 0 rgba(0,230,118,0); } 50% { box-shadow: 0 0 24px rgba(0,230,118,0.55); } 100% { box-shadow: 0 0 0 rgba(0,230,118,0); } }
      `}</style>

      <CelebrationConfetti active={celebrateRiderId !== null} variant="cannon" />

      {activeRideBanner}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h1
          style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: '32px',
            margin: 0,
          }}
        >
          Find Riders
        </h1>
        <Link
          href="/driver/home"
          style={{
            fontSize: '14px',
            color: '#00E676',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back
        </Link>
      </div>

      {/* Cap counter */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
        fontSize: 12, color: atCap ? '#FF5252' : '#888',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: 4,
          background: atCap ? '#FF5252' : '#00E676',
          display: 'inline-block',
        }} />
        <span>{capDisplay}</span>
        {atCap && <span style={{ marginLeft: 'auto', color: '#FF5252' }}>Cap reached</span>}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: 20, right: 20, zIndex: 50,
          background: '#141414', border: '1px solid rgba(0,230,118,0.3)',
          borderRadius: 14, padding: '12px 16px',
          fontSize: 14, color: '#fff', textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}>
          {toast}
        </div>
      )}

      {/* Empty state */}
      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>{'👋'}</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            No riders here yet
          </div>
          <div style={{ fontSize: '14px', color: '#888', lineHeight: 1.5 }}>
            Check back soon.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
          {list.map((rider) => {
            const celebrating = celebrateRiderId === rider.id;
            return (
              <div
                key={rider.id}
                style={{
                  background: '#141414',
                  border: celebrating
                    ? '1px solid rgba(0,230,118,0.55)'
                    : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  animation: celebrating ? 'glow 2s ease-in-out' : undefined,
                }}
              >
                {/* Masked avatar — 4:3 container mirrors /rider/browse pattern */}
                <div style={{
                  width: '100%', aspectRatio: '4 / 3', overflow: 'hidden',
                  position: 'relative', background: '#0A0A0A',
                }}>
                  {rider.avatarUrl ? (
                    <img
                      src={rider.avatarUrl}
                      alt=""
                      aria-hidden="true"
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        objectPosition: 'center', display: 'block',
                        filter: 'blur(18px)', transform: 'scale(1.15)',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      background: 'linear-gradient(135deg, #1a1a1a, #0a0a0a)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '40px', opacity: 0.3,
                    }}>
                      {'👤'}
                    </div>
                  )}
                </div>

                {/* Card content */}
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{
                    fontSize: '15px', fontWeight: 700, color: '#fff',
                    marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    @{rider.handle || 'rider'}
                  </div>
                  <div style={{
                    fontSize: '11px', color: '#888', marginBottom: '10px',
                    minHeight: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {rider.homeAreas.length ? rider.homeAreas.join(', ') : 'Area not set'}
                  </div>

                  <button
                    onClick={() => handleHmu(rider.id)}
                    disabled={sending === rider.id || atCap}
                    style={{
                      width: '100%', padding: '10px',
                      borderRadius: '100px', border: 'none',
                      background: atCap ? '#333' : '#00E676',
                      color: atCap ? '#888' : '#080808',
                      fontWeight: 700, fontSize: '13px',
                      cursor: (sending === rider.id || atCap) ? 'not-allowed' : 'pointer',
                      opacity: sending === rider.id ? 0.5 : 1,
                      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                      transition: 'all 0.15s',
                    }}
                  >
                    {sending === rider.id ? 'Sending…' : 'HMU'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
