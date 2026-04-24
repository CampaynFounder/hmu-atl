'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import Link from 'next/link';
import DealPill from '@/components/driver/deal-pill';
import { MapPin, Clock, DollarSign, ArrowRight, ChevronLeft } from 'lucide-react';
import RiderProfileOverlay from '@/components/rider/rider-profile-overlay';
import CashPackCard from '@/components/driver/cash-pack-card';
import PassReasonSheet, { type PassReason } from '@/components/driver/pass-reason-sheet';
import { useAbly } from '@/hooks/use-ably';

interface RiderRequest {
  id: string;
  type?: string;
  locked?: boolean;
  riderName: string;
  riderHandle?: string | null;
  riderAvatarUrl?: string | null;
  riderVideoUrl?: string | null;
  riderChillScore?: number;
  riderCompletedRides?: number;
  destination: string;
  time: string;
  stops: string;
  roundTrip: boolean;
  price: number;
  expiresAt: string;
  createdAt: string;
  areas?: string[];
  riderOnline?: boolean;
  isCash?: boolean;
}

interface Props {
  driverUserId: string;
  driverAreas: string[];
  marketSlug: string;
}

export default function DriverFeedClient({ driverUserId, driverAreas, marketSlug }: Props) {
  const [requests, setRequests] = useState<RiderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [viewingRiderHandle, setViewingRiderHandle] = useState<string | null>(null);
  const [showCashPackPurchase, setShowCashPackPurchase] = useState(false);
  // Pass flow: SwipeableCard.onDecline calls openPassSheet(postId). The sheet
  // collects reason + optional message, then calls submitPass() which hits
  // /api/bookings/[postId]/decline with the payload. `resolvePendingPass` is
  // how we signal true/false back to SwipeableCard's animation.
  const [pendingPassPostId, setPendingPassPostId] = useState<string | null>(null);
  const [pendingPassResolver, setPendingPassResolver] = useState<((ok: boolean) => void) | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers/requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } catch {
      // retry on next poll
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — Ably handles real-time updates
  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Subscribe to the market feed channel for real-time rider request notifications
  useAbly({
    channelName: `market:${marketSlug}:feed`,
    onMessage: useCallback(() => { fetchRequests(); }, [fetchRequests]),
  });

  // Also subscribe to the driver's personal notify so cross-surface events
  // (e.g. they pass a request from /driver/home in another tab → server
  // emits pass_committed → /driver/feed refetches and the card disappears
  // here too) propagate without a manual refresh.
  useAbly({
    channelName: `user:${driverUserId}:notify`,
    onMessage: useCallback(() => { fetchRequests(); }, [fetchRequests]),
  });

  const handleAccept = async (postId: string) => {
    try {
      const res = await fetch(`/api/bookings/${postId}/accept`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== postId));
        if (data.rideId) {
          setActionFeedback('Matched!');
          window.location.replace(`/ride/${data.rideId}`);
        } else if (data.status === 'interested') {
          setActionFeedback('Interest sent — waiting for rider to pick you');
          setTimeout(() => setActionFeedback(null), 4000);
        } else {
          setActionFeedback('Accepted!');
        }
      } else if (data.code === 'no_cash_rides') {
        setShowCashPackPurchase(true);
      } else {
        setActionFeedback(data.error || 'Failed to accept');
        setTimeout(() => setActionFeedback(null), 4000);
      }
    } catch {
      setActionFeedback('Network error');
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Open the pass-reason sheet. Returns a promise so SwipeableCard can await
  // the final outcome (accept the swipe animation only after the pass lands).
  const handleDecline = (postId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingPassPostId(postId);
      setPendingPassResolver(() => resolve);
    });
  };

  const submitPass = async (reason: PassReason | null, message: string) => {
    const postId = pendingPassPostId;
    if (!postId) return;
    try {
      const res = await fetch(`/api/bookings/${postId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionFeedback(data.error || `Couldn't pass (${res.status})`);
        setTimeout(() => setActionFeedback(null), 3000);
        pendingPassResolver?.(false);
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== postId));
      setActionFeedback(data.status === 'declined_awaiting_rider' ? 'Passed — rider notified' : 'Passed');
      setTimeout(() => setActionFeedback(null), 2000);
      pendingPassResolver?.(true);
    } catch {
      setActionFeedback('Network error — try again');
      setTimeout(() => setActionFeedback(null), 3000);
      pendingPassResolver?.(false);
    } finally {
      setPendingPassPostId(null);
      setPendingPassResolver(null);
    }
  };

  const cancelPass = () => {
    pendingPassResolver?.(false);
    setPendingPassPostId(null);
    setPendingPassResolver(null);
  };

  const current = requests[currentIndex];
  const next = requests[currentIndex + 1];

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .feed-page { background: var(--black); min-height: 100svh; color: #fff; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .feed-header { position: fixed; top: 56px; left: 0; right: 0; z-index: 10; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
        .feed-back { display: flex; align-items: center; gap: 4px; color: var(--green); font-size: 14px; font-weight: 600; text-decoration: none; }
        .feed-status { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); border-radius: 100px; padding: 6px 14px; font-size: 13px; }
        .feed-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        .feed-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: calc(100svh - 56px); padding: 40px 20px; text-align: center; }
        .feed-empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.4; }
        .feed-empty-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; margin-bottom: 8px; }
        .feed-empty-sub { font-size: 14px; color: var(--gray); line-height: 1.5; max-width: 280px; margin: 0 auto 24px; }
        .feed-empty-areas { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 24px; }
        .feed-empty-area { font-size: 12px; color: var(--gray-light); background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; }
        .feed-share-btn { display: inline-block; background: var(--green); color: var(--black); font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 100px; text-decoration: none; }

        .card-stack { position: fixed; top: 56px; left: 0; right: 0; bottom: 0; overflow: hidden; }
        .rider-card { position: absolute; inset: 0; padding: 80px 16px 24px; }
        .rider-card-inner { height: 100%; background: var(--card); border: 1px solid var(--border); border-radius: 28px; overflow: hidden; display: flex; flex-direction: column; }

        .rc-hero { padding: 28px 24px 20px; flex-shrink: 0; }
        .rc-name { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; line-height: 1; margin-bottom: 4px; }
        .rc-time-ago { font-size: 12px; color: var(--gray); }

        .rc-route { padding: 0 24px 20px; flex-shrink: 0; }
        .rc-route-box { background: var(--card2); border: 1px solid var(--border); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .rc-route-row { display: flex; align-items: flex-start; gap: 12px; }
        .rc-route-dot { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
        .rc-route-dot--pickup { background: rgba(0,230,118,0.15); color: var(--green); }
        .rc-route-dot--dropoff { background: rgba(255,82,82,0.15); color: #FF5252; }
        .rc-route-label { font-size: 11px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; }
        .rc-route-addr { font-size: 14px; font-weight: 500; margin-top: 2px; }
        .rc-route-connector { margin-left: 16px; width: 1px; height: 16px; background: rgba(255,255,255,0.1); border-left: 1px dashed rgba(255,255,255,0.15); }
        .rc-stops { margin-left: 44px; font-size: 13px; color: var(--gray-light); padding: 4px 0; }

        .rc-details { padding: 0 24px; display: flex; gap: 10px; flex-wrap: wrap; flex-shrink: 0; margin-bottom: 16px; }
        .rc-pill { display: flex; align-items: center; gap: 6px; background: var(--card2); border: 1px solid var(--border); border-radius: 100px; padding: 8px 14px; font-size: 13px; color: var(--gray-light); }
        .rc-pill-icon { color: var(--green); }

        .rc-price { padding: 0 24px; text-align: center; flex-shrink: 0; margin-bottom: 20px; }
        .rc-price-label { font-size: 11px; color: var(--gray); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
        .rc-price-value { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 56px; color: var(--green); line-height: 1; animation: priceIn 0.6s ease-out; }
        @keyframes priceIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }

        .rc-actions { padding: 0 24px 24px; margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
        .rc-btn { width: 100%; padding: 16px; border-radius: 100px; border: none; font-weight: 700; font-size: 16px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .rc-btn:active { transform: scale(0.97); }
        .rc-btn--accept { background: var(--green); color: var(--black); }
        .rc-btn--decline { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: var(--gray-light); }

        .rc-swipe-hint { text-align: center; font-size: 11px; color: var(--gray); padding: 8px 0; }

        .feed-toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: var(--green); color: var(--black); font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 100px; z-index: 60; animation: toastIn 0.3s ease-out; }
        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

        .swipe-label { position: absolute; top: 50%; z-index: 5; font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 48px; pointer-events: none; }
        .swipe-label--accept { right: 32px; color: var(--green); transform: translateY(-50%) rotate(12deg); }
        .swipe-label--skip { left: 32px; color: #FF5252; transform: translateY(-50%) rotate(-12deg); }
      `}</style>

      <div className="feed-page">
        {/* Header */}
        <div className="feed-header">
          <Link href="/driver/home" className="feed-back">
            <ChevronLeft className="h-4 w-4" /> Home
          </Link>
          <div className="feed-status">
            <div className="feed-dot" />
            {requests.length} request{requests.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ position: 'fixed', top: 100, left: 20, right: 20, zIndex: 9 }}><DealPill /></div>

        {/* Empty state */}
        {!loading && requests.length === 0 && (
          <div className="feed-empty">
            <div className="feed-empty-icon">{'\uD83D\uDE34'}</div>
            <div className="feed-empty-title">NO RIDE REQUESTS YET</div>
            <p className="feed-empty-sub">
              Share your HMU link to get riders booking you directly. Requests show up here as swipeable cards.
            </p>
            {driverAreas.length > 0 && (
              <div className="feed-empty-areas">
                {driverAreas.map((a) => (
                  <span key={a} className="feed-empty-area">{a}</span>
                ))}
              </div>
            )}
            <Link href="/driver/home" className="feed-share-btn">
              Share My Link
            </Link>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="feed-empty">
            <div className="feed-dot" style={{ width: 12, height: 12 }} />
          </div>
        )}

        {/* Card Stack */}
        {!loading && requests.length > 0 && (
          <div className="card-stack">
            <AnimatePresence mode="popLayout">
              {/* Background card */}
              {next && (
                <motion.div
                  key={`bg-${next.id}`}
                  className="rider-card"
                  initial={{ scale: 0.92, opacity: 0.4 }}
                  animate={{ scale: 0.95, opacity: 0.6 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                >
                  <div className="rider-card-inner" style={{ opacity: 0.5 }} />
                </motion.div>
              )}

              {/* Current card */}
              {current && (
                <SwipeableCard
                  key={current.id}
                  request={current}
                  onAccept={async () => { await handleAccept(current.id); return true; }}
                  onDecline={() => handleDecline(current.id)}
                  onViewProfile={(h) => setViewingRiderHandle(h)}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Feedback toast */}
        {actionFeedback && <div className="feed-toast">{actionFeedback}</div>}

        {/* Pass-reason sheet — opens when SwipeableCard triggers onDecline */}
        <PassReasonSheet
          open={pendingPassPostId !== null}
          onClose={cancelPass}
          onConfirm={submitPass}
        />
      </div>

      {/* Cash pack purchase overlay */}
      {showCashPackPurchase && (
        <>
          <div
            onClick={() => setShowCashPackPurchase(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: '#0a0a0a', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px',
            maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 16px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              No cash rides remaining
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              Purchase a Cash Pack to accept this ride, or upgrade to HMU First for unlimited.
            </div>
            <CashPackCard />
            <button
              onClick={() => setShowCashPackPurchase(false)}
              style={{
                width: '100%', padding: 14, borderRadius: 100, marginTop: 8,
                border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                color: '#888', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Close
            </button>
          </div>
        </>
      )}

      {/* Rider profile overlay */}
      {viewingRiderHandle && (
        <RiderProfileOverlay
          handle={viewingRiderHandle}
          open={true}
          onClose={() => setViewingRiderHandle(null)}
        />
      )}
    </>
  );
}

function SwipeableCard({
  request,
  onAccept,
  onDecline,
  onViewProfile,
}: {
  request: RiderRequest;
  onAccept: () => Promise<boolean> | void;
  onDecline: () => Promise<boolean> | void;
  onViewProfile: (handle: string) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const acceptOpacity = useTransform(x, [0, 80, 200], [0, 0.5, 1]);
  const skipOpacity = useTransform(x, [-200, -80, 0], [1, 0.5, 0]);
  const [dismissed, setDismissed] = useState<'left' | 'right' | null>(null);
  const locked = !!request.locked;

  const fireAction = async (dir: 'left' | 'right', action: () => Promise<boolean> | void) => {
    if (locked) return;
    setDismissed(dir);
    // Wait for exit animation, then run the action. If the action fails
    // (returns false), reverse the dismissal so the card reappears and the
    // driver can retry.
    await new Promise((r) => setTimeout(r, 300));
    const ok = await action();
    if (ok === false) {
      x.set(0);
      setDismissed(null);
    }
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 120) fireAction('right', onAccept);
    else if (info.offset.x < -120) fireAction('left', onDecline);
  };

  const handlePassClick = () => fireAction('left', onDecline);
  const handleAcceptClick = () => fireAction('right', onAccept);

  const timeAgo = getTimeAgo(request.createdAt);

  return (
    <motion.div
      className="rider-card"
      style={{ x, rotate, opacity: locked ? 0.72 : 1 }}
      drag={!dismissed && !locked ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      initial={{ scale: 0.95, opacity: 0, y: 20 }}
      animate={dismissed === 'left'
        ? { x: -400, rotate: -15, opacity: 0 }
        : dismissed === 'right'
        ? { x: 400, rotate: 15, opacity: 0 }
        : { scale: 1, opacity: 1, y: 0 }
      }
      exit={{ scale: 1.02, opacity: 0, y: -30 }}
      transition={{ duration: dismissed ? 0.3 : 0.25 }}
    >
      <div className="rider-card-inner">
        {/* Media hero — video or avatar */}
        <div style={{
          position: 'relative', width: '100%', height: '220px',
          overflow: 'hidden', borderRadius: '28px 28px 0 0',
          background: '#1a1a1a',
        }}>
          {request.riderVideoUrl ? (
            <video
              src={request.riderVideoUrl}
              autoPlay muted loop playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : request.riderAvatarUrl ? (
            <img src={request.riderAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #1a1a1a, #141414)',
              fontSize: 64, color: '#333',
            }}>
              {request.riderName.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Gradient overlay for text contrast */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
          }} />
          {/* Overlay: name + badges + price */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div
                style={{
                  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                  fontSize: 28, lineHeight: 1, color: '#fff',
                  cursor: request.riderHandle ? 'pointer' : 'default',
                }}
                onClick={(e) => { e.stopPropagation(); if (request.riderHandle) onViewProfile(request.riderHandle); }}
              >
                {request.riderName}
              </div>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: request.riderOnline ? '#00E676' : '#555',
              }} />
              {request.type === 'direct' && (
                <span style={{ fontSize: 10, background: 'rgba(0,230,118,0.2)', color: '#00E676', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>
                  For you
                </span>
              )}
              {request.isCash && (
                <span style={{ fontSize: 10, background: 'rgba(255,193,7,0.2)', color: '#FFC107', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>
                  💵 Cash
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              {(request.riderChillScore ?? 0) > 0 && (
                <span><span style={{ color: '#00E676', fontWeight: 700 }}>{request.riderChillScore}%</span> Chill</span>
              )}
              {(request.riderCompletedRides ?? 0) > 0 && (
                <span>{request.riderCompletedRides} rides</span>
              )}
              <span>{timeAgo}</span>
            </div>
          </div>
        </div>

        {/* Ride details */}
        <div style={{ padding: '16px 20px 0' }}>
          {/* Destination */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            marginBottom: 12,
          }}>
            <MapPin className="h-4 w-4" style={{ color: '#00E676', marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 15, fontWeight: 500 }}>{request.destination || 'Not specified'}</div>
          </div>

          {request.stops && request.stops !== 'none' && (
            <div style={{ fontSize: 13, color: '#888', marginBottom: 8, paddingLeft: 26 }}>+ {request.stops}</div>
          )}
        </div>

        {/* Details pills */}
        <div className="rc-details">
          <div className="rc-pill">
            <Clock className="h-3.5 w-3.5 rc-pill-icon" />
            {request.time || 'ASAP'}
          </div>
          {request.roundTrip && (
            <div className="rc-pill">
              <ArrowRight className="h-3.5 w-3.5 rc-pill-icon" />
              Round trip
            </div>
          )}
        </div>

        {/* Price */}
        <div className="rc-price">
          <div className="rc-price-label">Offering</div>
          <div className="rc-price-value">${request.price}</div>
        </div>

        {/* Actions */}
        <div className="rc-actions">
          {locked ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 16px', borderRadius: 100,
              border: '1px solid rgba(255,145,0,0.35)',
              background: 'rgba(255,145,0,0.08)',
              color: '#FFB366',
              fontSize: 13, fontWeight: 600,
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#FF9100',
                animation: 'lockedPulse 1.6s ease-in-out infinite',
              }} />
              <style>{`@keyframes lockedPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
              Waiting on rider — could open up any minute
            </div>
          ) : (
            <>
              <button className="rc-btn rc-btn--accept" onClick={handleAcceptClick} disabled={!!dismissed}>
                {request.type === 'direct' ? `Accept $${request.price}` : `HMU $${request.price}`}
              </button>
              <button className="rc-btn rc-btn--decline" onClick={handlePassClick} disabled={!!dismissed}>
                Pass
              </button>
              <div className="rc-swipe-hint">
                Swipe right to accept · left to pass
              </div>
            </>
          )}
        </div>
      </div>

      {/* Swipe indicators */}
      <motion.div className="swipe-label swipe-label--accept" style={{ opacity: dismissed === 'right' ? 1 : acceptOpacity }}>
        HMU
      </motion.div>
      <motion.div className="swipe-label swipe-label--skip" style={{ opacity: dismissed === 'left' ? 1 : skipOpacity }}>
        NAH
      </motion.div>
    </motion.div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
