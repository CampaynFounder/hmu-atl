'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import Link from 'next/link';
import { MapPin, Clock, DollarSign, ArrowRight, ChevronLeft } from 'lucide-react';

interface RiderRequest {
  id: string;
  type?: string;
  riderName: string;
  destination: string;
  time: string;
  stops: string;
  roundTrip: boolean;
  price: number;
  expiresAt: string;
  createdAt: string;
  areas?: string[];
}

interface Props {
  driverUserId: string;
  driverAreas: string[];
}

export default function DriverFeedClient({ driverAreas }: Props) {
  const [requests, setRequests] = useState<RiderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const handleAccept = async (postId: string) => {
    try {
      const res = await fetch(`/api/bookings/${postId}/accept`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setRequests((prev) => prev.filter((r) => r.id !== postId));
        setActionFeedback('Accepted!');
        // Redirect to ride view
        if (data.rideId) {
          window.location.href = `/ride/${data.rideId}`;
        }
      }
    } catch { /* silent */ }
  };

  const handleDecline = async (postId: string) => {
    try {
      const res = await fetch(`/api/bookings/${postId}/decline`, { method: 'POST' });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== postId));
        setActionFeedback('Declined');
        setTimeout(() => setActionFeedback(null), 2000);
      }
    } catch { /* silent */ }
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
                  onAccept={() => handleAccept(current.id)}
                  onDecline={() => handleDecline(current.id)}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Feedback toast */}
        {actionFeedback && <div className="feed-toast">{actionFeedback}</div>}
      </div>
    </>
  );
}

function SwipeableCard({
  request,
  onAccept,
  onDecline,
}: {
  request: RiderRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const acceptOpacity = useTransform(x, [0, 80, 200], [0, 0.5, 1]);
  const skipOpacity = useTransform(x, [-200, -80, 0], [1, 0.5, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 120) {
      onAccept();
    } else if (info.offset.x < -120) {
      onDecline();
    }
  };

  const timeAgo = getTimeAgo(request.createdAt);

  return (
    <motion.div
      className="rider-card"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      initial={{ scale: 0.95, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 1.02, opacity: 0, y: -30 }}
      transition={{ duration: 0.25 }}
    >
      <div className="rider-card-inner">
        {/* Hero */}
        <div className="rc-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div className="rc-name">{request.riderName}</div>
            {request.type === 'broadcast' && (
              <span style={{ fontSize: '10px', background: 'rgba(68,138,255,0.15)', color: '#448AFF', padding: '2px 8px', borderRadius: '100px', fontWeight: 600 }}>
                Broadcast
              </span>
            )}
            {request.type === 'direct' && (
              <span style={{ fontSize: '10px', background: 'rgba(0,230,118,0.15)', color: '#00E676', padding: '2px 8px', borderRadius: '100px', fontWeight: 600 }}>
                For you
              </span>
            )}
          </div>
          <div className="rc-time-ago">{timeAgo}</div>
        </div>

        {/* Route */}
        <div className="rc-route">
          <div className="rc-route-box">
            <div className="rc-route-row">
              <div className="rc-route-dot rc-route-dot--pickup">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <div className="rc-route-label">Where</div>
                <div className="rc-route-addr">{request.destination || 'Not specified'}</div>
              </div>
            </div>

            {request.stops && request.stops !== 'none' && (
              <>
                <div className="rc-route-connector" />
                <div className="rc-stops">+ {request.stops}</div>
              </>
            )}
          </div>
        </div>

        {/* Details */}
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
          <button className="rc-btn rc-btn--accept" onClick={onAccept}>
            Accept ${request.price}
          </button>
          <button className="rc-btn rc-btn--decline" onClick={onDecline}>
            Pass
          </button>
          <div className="rc-swipe-hint">
            Swipe right to accept · left to pass
          </div>
        </div>
      </div>

      {/* Swipe indicators */}
      <motion.div className="swipe-label swipe-label--accept" style={{ opacity: acceptOpacity }}>
        BET
      </motion.div>
      <motion.div className="swipe-label swipe-label--skip" style={{ opacity: skipOpacity }}>
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
