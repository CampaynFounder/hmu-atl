'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAbly } from '@/hooks/use-ably';

interface PostData {
  id: string;
  status: 'active' | 'matched' | 'cancelled' | 'expired';
  price: number;
  expiresAt: string;
  pickupAddress: string;
  dropoffAddress: string;
  sumExtraText: string;
  sumExtraMediaUrl: string;
  sumExtraMediaType: 'photo' | 'video';
  isDirectOffer: boolean;
}

interface StatusPayload {
  post: PostData;
  rideId: string | null;
  driverName: string | null;
  driverHandle: string | null;
  driverAvatarUrl: string | null;
}

export default function DownBadStatusClient({
  postId,
  userId,
}: {
  postId: string;
  userId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const redirectedRef = useRef(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/rider/down-bad/${postId}`);
      if (!res.ok) return;
      const payload = (await res.json()) as StatusPayload;
      setData(payload);
      // If already matched and have a rideId, redirect immediately.
      if (payload.rideId && !redirectedRef.current) {
        redirectedRef.current = true;
        router.push(`/ride/${payload.rideId}`);
      }
    } finally {
      setLoading(false);
    }
  }, [postId, router]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  // 1-second ticker for the countdown
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // User notification channel — fires when a driver RUNs IT
  useAbly({
    channelName: `user:${userId}:notify`,
    onMessage: useCallback((msg: { name: string; data: unknown }) => {
      if (msg.name === 'booking_accepted') {
        const d = msg.data as { rideId?: string; driverName?: string };
        if (d.rideId && !redirectedRef.current) {
          redirectedRef.current = true;
          showToast(`${d.driverName || 'Driver'} is running it!`);
          setTimeout(() => router.push(`/ride/${d.rideId!}`), 800);
        }
      }
    }, [router]),
  });

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel your Down Bad post?')) return;
    setCancelling(true);
    try {
      await fetch(`/api/rider/down-bad/${postId}/cancel`, { method: 'POST' });
      router.replace('/rider/home');
    } catch {
      showToast('Could not cancel — try again');
      setCancelling(false);
    }
  }, [postId, router]);

  const handleRepost = useCallback(() => {
    router.push('/rider/down-bad/new');
  }, [router]);

  if (loading) {
    return (
      <div style={styles.screen}>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...styles.screen, ...styles.centered }}>
        <p style={{ color: '#888', fontSize: 14 }}>Something went wrong. Try refreshing.</p>
        <button onClick={() => void refresh()} style={styles.ghostBtn}>Refresh</button>
      </div>
    );
  }

  const { post, rideId, driverName, driverAvatarUrl } = data;
  const msLeft = new Date(post.expiresAt).getTime() - now;
  const isExpired = msLeft <= 0;
  const effectiveStatus = isExpired && post.status === 'active' ? 'expired' : post.status;

  const minsLeft = Math.max(0, Math.floor(msLeft / 60_000));
  const secsLeft = Math.max(0, Math.floor((msLeft % 60_000) / 1000));
  const countdownStr = minsLeft > 0
    ? `${minsLeft}m ${String(secsLeft).padStart(2, '0')}s`
    : `${secsLeft}s`;

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => router.push('/rider/home')} style={styles.backBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>DOWN BAD</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Content */}
      <div style={styles.content}>
        <AnimatePresence mode="wait">
          {effectiveStatus === 'matched' ? (
            <motion.div key="matched" {...fadeUp} style={styles.centeredBlock}>
              {/* Driver avatar */}
              <div style={styles.avatarRing}>
                {driverAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={driverAvatarUrl} alt={driverName || 'Driver'} style={styles.avatar} />
                ) : (
                  <div style={styles.avatarFallback}>
                    {(driverName || 'D')[0].toUpperCase()}
                  </div>
                )}
                <div style={styles.matchedBadge}>✓</div>
              </div>
              <p style={{ color: '#00E676', fontWeight: 900, fontSize: 22, margin: '16px 0 4px' }}>
                {driverName || 'Driver'} is running it!
              </p>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>
                Driver matched — they&apos;re on their way
              </p>
              {rideId && (
                <button
                  onClick={() => router.push(`/ride/${rideId}`)}
                  style={styles.primaryBtn}
                >
                  View Ride →
                </button>
              )}
            </motion.div>

          ) : effectiveStatus === 'cancelled' ? (
            <motion.div key="cancelled" {...fadeUp} style={styles.centeredBlock}>
              <div style={styles.stateEmoji}>😮‍💨</div>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 20, margin: '12px 0 6px' }}>Post cancelled</p>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>No worries — you can post again anytime.</p>
              <button onClick={handleRepost} style={styles.primaryBtn}>Post Again</button>
            </motion.div>

          ) : effectiveStatus === 'expired' ? (
            <motion.div key="expired" {...fadeUp} style={styles.centeredBlock}>
              <div style={styles.stateEmoji}>⏰</div>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 20, margin: '12px 0 6px' }}>Post expired</p>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>No driver ran it in time. Try again?</p>
              <button onClick={handleRepost} style={styles.primaryBtn}>Post Again</button>
            </motion.div>

          ) : (
            /* active — waiting */
            <motion.div key="waiting" {...fadeUp} style={{ width: '100%' }}>
              {/* Countdown */}
              <div style={styles.countdownBlock}>
                <p style={{ color: '#555', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  Expires in
                </p>
                <p style={{
                  color: minsLeft < 2 ? '#FF4444' : '#fff',
                  fontWeight: 900, fontSize: 42, fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'monospace', margin: 0,
                }}>
                  {countdownStr}
                </p>
                <p style={{ color: '#333', fontSize: 11, marginTop: 6 }}>
                  {post.isDirectOffer ? 'Direct offer — sent to your driver' : 'Visible to all opted-in drivers'}
                </p>
              </div>

              {/* Sum extra preview */}
              <div style={styles.card}>
                <SumExtraPreview
                  mediaUrl={post.sumExtraMediaUrl}
                  mediaType={post.sumExtraMediaType}
                  text={post.sumExtraText}
                />
              </div>

              {/* Route */}
              <div style={styles.card}>
                <div style={styles.routeRow}>
                  <span style={{ color: '#00E676', fontSize: 13, marginTop: 2 }}>▲</span>
                  <p style={{ color: '#ccc', fontSize: 13, margin: 0, flex: 1 }}>{post.pickupAddress}</p>
                </div>
                <div style={styles.routeDivider} />
                <div style={styles.routeRow}>
                  <span style={{ color: '#FF6B6B', fontSize: 13, marginTop: 2 }}>●</span>
                  <p style={{ color: '#888', fontSize: 13, margin: 0, flex: 1 }}>{post.dropoffAddress}</p>
                </div>
              </div>

              {/* Deposit */}
              <div style={{ ...styles.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#888', fontSize: 13 }}>Cash deposit</span>
                <span style={{ color: '#00E676', fontWeight: 900, fontSize: 18 }}>${post.price}</span>
              </div>

              {/* Cancel */}
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={styles.cancelBtn}
              >
                {cancelling ? 'Cancelling…' : 'Cancel Post'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={styles.toast}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SumExtraPreview({
  mediaUrl,
  mediaType,
  text,
}: {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  text: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (mediaType === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [mediaType]);

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 68, height: 68, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#1a1a1a' }}>
        {mediaType === 'video' ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
            loop
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="Sum extra" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: '#666', fontSize: 11, margin: '0 0 4px', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Sum extra
        </p>
        <p style={{ color: '#ccc', fontSize: 14, margin: 0, lineHeight: 1.4 }}>
          🎁 {text}
        </p>
      </div>
    </div>
  );
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
};

const styles: Record<string, React.CSSProperties> = {
  screen: {
    minHeight: '100dvh',
    background: '#080808',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
  },
  backBtn: {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
    border: 'none', color: '#fff', cursor: 'pointer',
  },
  content: {
    flex: 1,
    padding: '8px 20px 40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  centeredBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    paddingTop: 48,
    width: '100%',
  },
  stateEmoji: { fontSize: 52 },
  avatarRing: {
    position: 'relative',
    width: 84, height: 84,
    borderRadius: '50%',
    border: '2px solid #00E676',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'visible',
  },
  avatar: {
    width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
  },
  avatarFallback: {
    width: 80, height: 80, borderRadius: '50%',
    background: '#1a1a1a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, fontWeight: 800, color: '#fff',
  },
  matchedBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 24, height: 24, borderRadius: '50%',
    background: '#00E676', color: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 900,
    border: '2px solid #080808',
  },
  countdownBlock: {
    textAlign: 'center',
    padding: '28px 0 20px',
    width: '100%',
  },
  card: {
    width: '100%', boxSizing: 'border-box',
    background: '#111',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '14px 16px',
    marginBottom: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  routeRow: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
  },
  routeDivider: {
    margin: '8px 0 8px 5px',
    borderLeft: '1px dashed #2a2a2a',
    height: 12,
  },
  primaryBtn: {
    width: '100%', maxWidth: 320,
    padding: '15px 0',
    background: '#fff',
    color: '#000',
    fontSize: 16, fontWeight: 800,
    borderRadius: 100, border: 'none',
    cursor: 'pointer',
  },
  ghostBtn: {
    marginTop: 16,
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.06)',
    color: '#888', fontSize: 14,
    borderRadius: 100, border: 'none', cursor: 'pointer',
  },
  cancelBtn: {
    width: '100%', marginTop: 12,
    padding: '13px 0',
    background: 'transparent',
    color: '#555', fontSize: 14,
    borderRadius: 100,
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
  },
  centered: {
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'column',
  },
  spinner: {
    margin: 'auto',
    width: 32, height: 32,
    border: '2px solid rgba(255,255,255,0.1)',
    borderTop: '2px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  toast: {
    position: 'fixed',
    bottom: 36, left: '50%',
    transform: 'translateX(-50%)',
    background: '#00E676', color: '#000',
    fontSize: 13, fontWeight: 700,
    padding: '10px 20px', borderRadius: 100,
    zIndex: 99, whiteSpace: 'nowrap',
  },
};
