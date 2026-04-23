'use client';

import { useEffect, useState, useCallback } from 'react';
import CelebrationConfetti from '@/components/shared/celebration-confetti';

interface IncomingHmu {
  hmuId: string;
  driverId: string;
  handle: string;
  displayName: string;
  areas: string[];
  avatarUrl: string | null;
  message: string | null;
  createdAt: string;
}

interface Props {
  // Bump this to force the inbox to refetch. The parent (rider-feed-client) subscribes
  // to user:{riderId}:notify and bumps this on hmu_received so new sends surface live.
  refetchKey: number;
  // Called when the rider links or dismisses, giving the parent a chance to refresh
  // its own state (e.g. navigate to /rider/linked, clear related notifications).
  onResolved?: (result: { action: 'link' | 'dismiss'; driverId: string }) => void;
}

export default function HmuInbox({ refetchKey, onResolved }: Props) {
  const [items, setItems] = useState<IncomingHmu[]>([]);
  const [unread, setUnread] = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch('/api/rider/hmus', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.hmus ?? []);
      setUnread(data.unreadCount ?? 0);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox, refetchKey]);

  const handleLink = useCallback(async (h: IncomingHmu) => {
    if (resolving) return;
    setResolving(h.hmuId);
    setError(null);
    try {
      const res = await fetch(`/api/rider/hmu/${h.hmuId}/link`, { method: 'POST' });
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.hmuId !== h.hmuId));
        setUnread((n) => Math.max(0, n - 1));
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 2800);
        onResolved?.({ action: 'link', driverId: h.driverId });
      } else {
        setError('Could not link — try again.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setResolving(null);
    }
  }, [resolving, onResolved]);

  const handleDismiss = useCallback(async (h: IncomingHmu) => {
    if (resolving) return;
    setResolving(h.hmuId);
    setError(null);
    try {
      const res = await fetch(`/api/rider/hmu/${h.hmuId}/dismiss`, { method: 'POST' });
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.hmuId !== h.hmuId));
        setUnread((n) => Math.max(0, n - 1));
        onResolved?.({ action: 'dismiss', driverId: h.driverId });
      } else {
        setError('Could not dismiss — try again.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setResolving(null);
    }
  }, [resolving, onResolved]);

  if (items.length === 0) return null;

  return (
    <div style={{ margin: '0 20px 16px' }}>
      <CelebrationConfetti active={celebrate} variant="cannon" />
      <style>{`
        @keyframes hmuCelebrate { 0% { transform: scale(1); box-shadow: 0 0 0 rgba(0,230,118,0); } 40% { transform: scale(1.015); box-shadow: 0 0 36px rgba(0,230,118,0.4); } 100% { transform: scale(1); box-shadow: 0 0 0 rgba(0,230,118,0); } }
      `}</style>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
        color: '#FF3D71', padding: '0 4px 8px',
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
      }}>
        <span>Drivers who HMU&apos;d you</span>
        {unread > 0 && (
          <span style={{
            background: '#FF3D71', color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '1px 7px',
            borderRadius: 100, letterSpacing: 0,
          }}>
            {unread}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          animation: celebrate ? 'hmuCelebrate 2.6s ease-out' : undefined,
        }}
      >
        {items.map((h) => (
          <div
            key={h.hmuId}
            style={{
              background: '#141414',
              border: '1px solid rgba(255,61,113,0.22)',
              borderRadius: 18,
              padding: 12,
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            {/* Masked avatar */}
            <div style={{
              width: 58, height: 58, borderRadius: 12, overflow: 'hidden',
              background: '#0A0A0A', flexShrink: 0, position: 'relative',
            }}>
              {h.avatarUrl ? (
                <img
                  src={h.avatarUrl}
                  alt=""
                  aria-hidden="true"
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    filter: 'blur(14px)', transform: 'scale(1.2)',
                  }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, opacity: 0.35,
                }}>{'👤'}</div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                @{h.handle || 'driver'}
              </div>
              <div style={{ fontSize: 11, color: '#888',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.areas.length ? h.areas.slice(0, 3).join(', ') : 'Driver in your area'}
              </div>
              {h.message && (
                <div style={{ fontSize: 12, color: '#bbb', marginTop: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  “{h.message}”
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => handleLink(h)}
                disabled={resolving === h.hmuId}
                style={{
                  padding: '8px 14px', borderRadius: 100, border: 'none',
                  background: '#00E676', color: '#080808',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                  opacity: resolving === h.hmuId ? 0.5 : 1,
                }}
              >
                {resolving === h.hmuId ? '…' : 'Link'}
              </button>
              <button
                onClick={() => handleDismiss(h)}
                disabled={resolving === h.hmuId}
                style={{
                  padding: '6px 14px', borderRadius: 100,
                  border: '1px solid rgba(255,82,82,0.25)', background: 'transparent',
                  color: '#FF5252', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                  opacity: resolving === h.hmuId ? 0.5 : 1,
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#FF5252', padding: '6px 4px 0' }}>{error}</div>
      )}
    </div>
  );
}
