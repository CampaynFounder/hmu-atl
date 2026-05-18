'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAbly } from '@/hooks/use-ably';
import { posthog } from '@/components/analytics/posthog-provider';
import PassReasonSheet, { type PassReason } from '@/components/driver/pass-reason-sheet';

interface Request {
  id: string;
  type: 'blast' | 'direct' | 'open';
  locked: boolean;
  targetId: string | null;
  riderName: string;
  riderHandle: string | null;
  riderAvatarUrl: string | null;
  riderVideoUrl: string | null;
  riderChillScore: number;
  riderCompletedRides: number;
  isCash: boolean;
  destination: string;
  pickupAddress: string;
  time: string;
  stops: string;
  roundTrip: boolean;
  price: number;
  expiresAt: string;
  createdAt: string;
  riderOnline: boolean;
}

export interface DriverRequestsClientProps {
  driverId: string;
  marketSlug: string;
  driverLat: number | null;
  driverLng: number | null;
  feedMinScorePercentile: number;
}

export function DriverRequestsClient({ driverId, marketSlug }: DriverRequestsClientProps) {
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingPassPostId, setPendingPassPostId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [newRequestIds, setNewRequestIds] = useState<Set<string>>(new Set());
  const [exitDirs, setExitDirs] = useState<Record<string, 'left' | 'right'>>({});
  const initialLoadDone = useRef(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers/requests');
      if (!res.ok) { setRequests([]); return; }
      const data = await res.json();
      const incoming: Request[] = data.requests ?? [];

      if (!initialLoadDone.current) {
        setRequests(incoming);
        initialLoadDone.current = true;
        if (incoming.length > 0) {
          posthog.capture('driver_requests_feed_viewed', { count: incoming.length });
        }
      } else {
        setRequests((prev) => {
          if (!prev) return incoming;
          const prevIds = new Set(prev.map((r) => r.id));
          const justArrived = incoming.filter((r) => !prevIds.has(r.id)).map((r) => r.id);
          if (justArrived.length > 0) {
            setNewRequestIds((cur) => {
              const next = new Set(cur);
              justArrived.forEach((id) => next.add(id));
              return next;
            });
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(15);
            }
            setTimeout(() => {
              setNewRequestIds((cur) => {
                const next = new Set(cur);
                justArrived.forEach((id) => next.delete(id));
                return next;
              });
            }, 2600);
          }
          return incoming;
        });
      }
    } catch {
      if (!initialLoadDone.current) setRequests([]);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleAblyMessage = useCallback(() => { fetchRequests(); }, [fetchRequests]);

  useAbly({ channelName: `user:${driverId}:notify`, onMessage: handleAblyMessage });
  useAbly({ channelName: `market:${marketSlug}:feed`, onMessage: handleAblyMessage });

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchRequests(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchRequests]);

  const handleRequestExpired = useCallback((postId: string) => {
    setRequests((prev) => prev ? prev.filter((r) => r.id !== postId) : prev);
  }, []);

  const handleAction = async (postId: string, action: 'accept' | 'decline') => {
    if (action === 'decline') { setPendingPassPostId(postId); return; }
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/bookings/${postId}/accept`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setExitDirs((d) => ({ ...d, [postId]: 'right' }));
        setTimeout(() => {
          setRequests((prev) => prev ? prev.filter((r) => r.id !== postId) : prev);
          if (data.rideId) setTimeout(() => window.location.replace(`/ride/${data.rideId}`), 560);
        }, 0);
      } else if (data.error === 'PAYOUT_REQUIRED') {
        if (confirm('Set up your payout account to accept rides. Go to payout setup?')) {
          window.location.href = '/driver/payout-setup';
        }
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const submitPass = async (reason: PassReason | null, message: string) => {
    const postId = pendingPassPostId;
    if (!postId) return;
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/bookings/${postId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setExitDirs((d) => ({ ...d, [postId]: 'left' }));
        setTimeout(() => {
          setRequests((prev) => prev ? prev.filter((r) => r.id !== postId) : prev);
        }, 0);
        setActionToast(data.status === 'declined_awaiting_rider' ? 'Passed — rider notified' : 'Passed');
        setTimeout(() => setActionToast(null), 2000);
      } else {
        setActionToast(data.error || `Couldn't pass (${res.status})`);
        setTimeout(() => setActionToast(null), 3000);
      }
    } catch {
      setActionToast('Network error — try again');
      setTimeout(() => setActionToast(null), 3000);
    } finally {
      setActionLoading(null);
      setPendingPassPostId(null);
    }
  };

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .req-page { background: var(--black); color: #fff; min-height: 100svh; padding: 72px 20px 100px; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .req-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 12px; }
        .req-card.is-locked { opacity: 0.55; }
        .req-rider { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
        .req-detail { font-size: 13px; color: var(--gray-light); margin-bottom: 4px; display: flex; align-items: flex-start; gap: 6px; }
        .req-detail-label { color: var(--gray); min-width: 60px; flex-shrink: 0; }
        .req-price { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; color: var(--green); margin: 12px 0; }
        .req-actions { display: flex; gap: 10px; margin-top: 12px; }
        .req-btn { flex: 1; padding: 14px; border-radius: 100px; border: none; font-weight: 700; font-size: 15px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: transform 0.15s; }
        .req-btn:hover { transform: scale(1.02); }
        .req-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .req-btn--accept { background: var(--green); color: var(--black); }
        .req-btn--decline { background: var(--card2); border: 1px solid var(--border); color: #fff; }
        .req-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; }
        .req-badge--blast { background: rgba(255,100,0,0.15); color: #FF6400; border: 1px solid rgba(255,100,0,0.3); }
        .req-badge--direct { background: rgba(0,230,118,0.12); color: var(--green); border: 1px solid rgba(0,230,118,0.25); }
        .req-badge--locked { background: rgba(255,255,255,0.06); color: var(--gray); border: 1px solid rgba(255,255,255,0.1); }
        .loading-dots { display: flex; gap: 4px; justify-content: center; padding: 40px 0; }
        .loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: ldpulse 1.2s ease-in-out infinite; }
        .loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes ldpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.6)} }
        @keyframes newGlow {
          0%   { box-shadow: 0 0 0 2px rgba(0,230,118,0.8), 0 0 44px rgba(0,230,118,0.6); }
          70%  { box-shadow: 0 0 0 1px rgba(0,230,118,0.35), 0 0 22px rgba(0,230,118,0.25); }
          100% { box-shadow: 0 0 0 0 rgba(0,230,118,0), 0 0 0 rgba(0,230,118,0); }
        }
        .req-card.is-new { animation: newGlow 2.8s ease-out forwards; }
      `}</style>

      <div className="req-page">
        <motion.h1
          style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 36, lineHeight: 1, margin: '0 0 4px' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        >
          Open Requests
        </motion.h1>
        <motion.p
          style={{ fontSize: 14, color: '#888', margin: '0 0 28px' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.07 }}
        >
          Riders looking for a ride. Tap to respond.
        </motion.p>

        {requests === null && (
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        )}

        {requests && requests.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
            style={{
              marginTop: 32, padding: '32px 20px', borderRadius: 20,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>📭</div>
            <p style={{ fontSize: 14, color: '#888', margin: 0, lineHeight: 1.5 }}>
              No open requests right now. Hang tight — we&apos;ll buzz you when one lands.
            </p>
          </motion.div>
        )}

        {requests && requests.length > 0 && (
          <AnimatePresence initial={false}>
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                actionLoading={actionLoading}
                onAction={handleAction}
                isNew={newRequestIds.has(req.id)}
                exitDir={exitDirs[req.id]}
                onExpired={handleRequestExpired}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      <PassReasonSheet
        open={pendingPassPostId !== null}
        onClose={() => setPendingPassPostId(null)}
        onConfirm={submitPass}
      />

      {actionToast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#00E676', color: '#080808', fontWeight: 700, fontSize: 14,
          padding: '12px 24px', borderRadius: 100, zIndex: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {actionToast}
        </div>
      )}
    </>
  );
}

function RequestCard({
  req, actionLoading, onAction, isNew, exitDir, onExpired,
}: {
  req: Request;
  actionLoading: string | null;
  onAction: (id: string, action: 'accept' | 'decline') => void;
  isNew?: boolean;
  exitDir?: 'left' | 'right';
  onExpired?: (postId: string) => void;
}) {
  const [showRider, setShowRider] = useState(false);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!req.expiresAt) return;
    let removeTimer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const remaining = new Date(req.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown('Expired');
        if (!removeTimer && onExpired) {
          removeTimer = setTimeout(() => onExpired(req.id), 2400);
        }
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${mins}:${String(secs).padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      clearInterval(interval);
      if (removeTimer) clearTimeout(removeTimer);
    };
  }, [req.expiresAt, req.id, onExpired]);

  const isExpired = countdown === 'Expired';

  const exitVariant = exitDir
    ? {
        x: exitDir === 'left' ? -520 : 520,
        rotate: exitDir === 'left' ? -22 : 22,
        opacity: 0,
        transition: { duration: 0.55, ease: [0.32, 0, 0.67, 0] as const },
      }
    : { opacity: 0, x: 32, scale: 0.94, transition: { duration: 0.25, ease: 'easeIn' as const } };

  const badgeClass = req.locked ? 'req-badge req-badge--locked'
    : req.type === 'blast' ? 'req-badge req-badge--blast'
    : req.type === 'direct' ? 'req-badge req-badge--direct'
    : '';

  const badgeLabel = req.locked ? 'Locked'
    : req.type === 'blast' ? 'Blast'
    : req.type === 'direct' ? 'Direct'
    : '';

  return (
    <motion.div
      className={`req-card${isNew ? ' is-new' : ''}${req.locked ? ' is-locked' : ''}`}
      layout
      initial={{ opacity: 0, y: -44, scale: 0.9 }}
      animate={{ opacity: isExpired ? 0.5 : 1, y: 0, scale: 1 }}
      exit={exitVariant}
      transition={{ type: 'spring', stiffness: 180, damping: 22, mass: 1.05 }}
    >
      {/* Rider header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button
          onClick={() => setShowRider(!showRider)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
            background: '#1a1a1a', flexShrink: 0, border: '2px solid rgba(0,230,118,0.3)',
          }}>
            {req.riderAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={req.riderAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#555' }}>
                {(req.riderName || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="req-rider" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {req.riderHandle ? `@${req.riderHandle}` : req.riderName}
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: req.riderOnline ? '#00E676' : '#555',
                display: 'inline-block', flexShrink: 0,
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              Tap to {showRider ? 'hide' : 'view'} rider details
            </div>
          </div>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {badgeLabel && <span className={badgeClass}>{badgeLabel}</span>}
          <div style={{
            fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace",
            color: isExpired ? '#FF5252' : countdown && parseInt(countdown) < 5 ? '#FF9100' : '#00E676',
            background: isExpired ? 'rgba(255,82,82,0.1)' : 'rgba(0,230,118,0.08)',
            padding: '4px 10px', borderRadius: 100,
            border: `1px solid ${isExpired ? 'rgba(255,82,82,0.2)' : 'rgba(0,230,118,0.2)'}`,
          }}>
            {isExpired ? 'Expired' : countdown}
          </div>
        </div>
      </div>

      {/* Rider details — expandable */}
      {showRider && (
        <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Chill</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#00E676', fontFamily: "'Space Mono', monospace" }}>
                {req.riderChillScore.toFixed(0)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Rides</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: "'Space Mono', monospace" }}>
                {req.riderCompletedRides}
              </div>
            </div>
          </div>
          {req.riderVideoUrl && (
            <div style={{ borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
              <video src={req.riderVideoUrl} controls playsInline muted preload="metadata"
                style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'contain', background: '#000' }} />
            </div>
          )}
          {req.isCash && (
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#FFC107', background: 'rgba(255,193,7,0.12)', borderRadius: 100, padding: '4px 10px', display: 'inline-block' }}>
              💵 Cash Ride
            </div>
          )}
        </div>
      )}

      {/* Ride details */}
      {req.type === 'blast' ? (
        <>
          <div className="req-detail">
            <span className="req-detail-label">From</span>
            {req.pickupAddress || 'Not specified'}
          </div>
          <div className="req-detail">
            <span className="req-detail-label">To</span>
            {req.destination || 'Not specified'}
          </div>
          <div className="req-detail">
            <span className="req-detail-label">When</span>
            {req.time || 'Now'}
          </div>
        </>
      ) : (
        <>
          <div className="req-detail">
            <span className="req-detail-label">Where</span>
            {req.destination || 'Not specified'}
          </div>
          <div className="req-detail">
            <span className="req-detail-label">When</span>
            {req.time || 'ASAP'}
          </div>
          {req.stops && req.stops !== 'none' && req.stops !== 'Nah, straight there' && (
            <div className="req-detail">
              <span className="req-detail-label">Stops</span>
              {req.stops}
            </div>
          )}
          {req.roundTrip && (
            <div className="req-detail">
              <span className="req-detail-label">Trip</span>
              Round trip
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="req-price" style={{ margin: '12px 0' }}>${req.price}</div>
        {req.isCash && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#FFC107', background: 'rgba(255,193,7,0.12)', borderRadius: 100, padding: '4px 10px' }}>
            💵 Cash
          </span>
        )}
      </div>

      {!isExpired && !req.locked && (
        <div className="req-actions">
          <button
            className="req-btn req-btn--decline"
            onClick={() => onAction(req.id, 'decline')}
            disabled={actionLoading === req.id}
          >
            Pass
          </button>
          <button
            className="req-btn req-btn--accept"
            onClick={() => onAction(req.id, 'accept')}
            disabled={actionLoading === req.id}
          >
            {req.type === 'blast' ? 'HMU' : req.type === 'direct' ? 'Accept' : 'HMU'}
          </button>
        </div>
      )}

      {req.locked && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: '#666', textAlign: 'center' }}>
          Waiting for rider to broadcast
        </div>
      )}
    </motion.div>
  );
}
