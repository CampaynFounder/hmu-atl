'use client';

// Consolidated view of all blasts a driver has HMU'd on.
// Shows waiting / won / taken status with real-time Ably updates.
// Mounted in both /driver/home and /driver/requests above incoming requests.

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAbly } from '@/hooks/use-ably';

interface BlastEntry {
  blastId: string;
  targetId: string;
  price: number;
  timeLabel: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  riderName: string;
  riderAvatarUrl: string | null;
  status: 'waiting' | 'won' | 'taken';
  rideId: string | null;
  expiresAt: string;
}

export function DriverBlastStatusSection({ driverId }: { driverId: string }) {
  const router = useRouter();
  const [blasts, setBlasts] = useState<BlastEntry[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'win' | 'loss' } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers/blasts');
      if (!res.ok) return;
      const data = (await res.json()) as { blasts: BlastEntry[] };
      setBlasts(data.blasts ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useAbly({
    channelName: `user:${driverId}:notify`,
    onMessage: (msg) => {
      if (msg.name === 'blast_match_won') {
        const data = msg.data as { rideId?: string; message?: string };
        void refresh();
        setToast({ msg: data.message ?? "You got the ride! Rider is ready — pull up.", type: 'win' });
        setTimeout(() => setToast(null), 3500);
        if (data.rideId) {
          setTimeout(() => router.push(`/ride/${data.rideId}`), 1200);
        }
      } else if (msg.name === 'blast_taken') {
        void refresh();
        setToast({ msg: 'Rider went with someone else on this one.', type: 'loss' });
        setTimeout(() => setToast(null), 2500);
      }
    },
  });

  if (!blasts || blasts.length === 0) return null;

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#888',
          letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10,
        }}>
          Your Active HMUs
        </div>

        <AnimatePresence initial={false}>
          {blasts.map((b) => (
            <motion.div
              key={b.blastId}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -40, transition: { duration: 0.18 } }}
              transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}
              onClick={() => b.rideId ? router.push(`/ride/${b.rideId}`) : undefined}
              style={{
                background: b.status === 'won' ? 'rgba(0,230,118,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${b.status === 'won' ? 'rgba(0,230,118,0.28)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 14,
                padding: '12px 14px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: b.rideId ? 'pointer' : 'default',
              }}
            >
              {/* Rider avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: '#1a1a1a', overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: '#555',
              }}>
                {b.riderAvatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={b.riderAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (b.riderName || '?')[0].toUpperCase()
                }
              </div>

              {/* Ride details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                    fontSize: 20, color: '#00E676', lineHeight: 1,
                  }}>
                    ${b.price}
                  </span>
                  <span style={{ fontSize: 12, color: '#888' }}>{b.timeLabel}</span>
                </div>
                <div style={{
                  fontSize: 12, color: '#bbb',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {b.pickupAddress?.split(',')[0] ?? '?'} → {b.dropoffAddress?.split(',')[0] ?? '?'}
                </div>
              </div>

              {/* Status chip */}
              {b.status === 'won' && (
                <div style={{
                  fontSize: 11, fontWeight: 700, color: '#00E676',
                  background: 'rgba(0,230,118,0.12)',
                  border: '1px solid rgba(0,230,118,0.25)',
                  borderRadius: 100, padding: '5px 12px', flexShrink: 0,
                }}>
                  Pull Up →
                </div>
              )}
              {b.status === 'waiting' && (
                <div style={{
                  fontSize: 11, color: '#666',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 100, padding: '5px 12px', flexShrink: 0,
                }}>
                  Waiting…
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="blast-status-toast"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
              background: toast.type === 'win' ? '#00E676' : '#1a1a1a',
              color: toast.type === 'win' ? '#080808' : '#fff',
              border: toast.type === 'loss' ? '1px solid rgba(255,255,255,0.1)' : 'none',
              fontWeight: 700, fontSize: 14,
              padding: '12px 24px', borderRadius: 100, zIndex: 300,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              whiteSpace: 'nowrap', maxWidth: '90vw',
              textOverflow: 'ellipsis', overflow: 'hidden',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
