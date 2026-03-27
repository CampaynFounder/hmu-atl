'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAbly } from '@/hooks/use-ably';
import CashoutCard from '@/components/driver/cashout-card';
import DealCard from '@/components/driver/deal-card';

interface BookingRequest {
  id: string;
  riderName: string;
  riderHandle: string | null;
  riderAvatarUrl: string | null;
  riderVideoUrl: string | null;
  riderChillScore: number;
  riderCompletedRides: number;
  isCash: boolean;
  destination: string;
  time: string;
  stops: string;
  roundTrip: boolean;
  price: number;
  expiresAt: string;
  createdAt?: string;
  riderOnline?: boolean;
}

interface Props {
  userId: string;
  handle: string;
  displayName: string;
  shareUrl: string;
  areas: string[];
  pricing: Record<string, unknown>;
  isHmuFirst: boolean;
  completedRides: number;
  payoutSetup: boolean;
  cashOnly: boolean;
}

export default function DriverHomeClient({
  userId,
  handle,
  displayName,
  shareUrl,
  areas,
  isHmuFirst,
  completedRides,
  payoutSetup,
  cashOnly,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers/requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } catch {
      // silent fail — will retry on next poll
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 30000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  // Re-fetch immediately on any Ably notification (cancelled ride, new request, etc.)
  const handleAblyMessage = useCallback(() => {
    fetchRequests();
  }, [fetchRequests]);

  useAbly({
    channelName: `user:${userId}:notify`,
    onMessage: handleAblyMessage,
  });

  // Re-fetch when page becomes visible (returning from ride page after cancel)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchRequests();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchRequests]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = `https://${shareUrl}`;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = () => {
    const url = `https://${shareUrl}`;
    if (typeof navigator.share === 'function') {
      navigator.share({
        title: `Book ${displayName} on HMU ATL`,
        text: `Need a ride in ATL? Book me directly:`,
        url,
      }).catch(() => {
        // User cancelled or share failed — fall back to copy
        handleCopy();
      });
    } else {
      handleCopy();
    }
  };

  const handleAction = async (postId: string, action: 'accept' | 'decline') => {
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/bookings/${postId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== postId));
        if (action === 'accept' && data.rideId) {
          if (data.rideId) window.location.replace(`/ride/${data.rideId}`);
        }
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

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .driver-home { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding: 24px 20px 100px; }
        .greeting { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; line-height: 1.1; margin-bottom: 4px; }
        .greeting-sub { font-size: 14px; color: var(--gray); margin-bottom: 28px; }
        .share-card { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 24px 20px; margin-bottom: 32px; }
        .share-label { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 12px; }
        .share-url-pill { background: var(--card2); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; font-family: var(--font-mono, 'Space Mono', monospace); font-size: 13px; color: var(--green); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 16px; }
        .share-buttons { display: flex; gap: 10px; }
        .share-btn { flex: 1; padding: 14px; border-radius: 100px; border: none; font-family: var(--font-body, 'DM Sans', sans-serif); font-weight: 700; font-size: 15px; cursor: pointer; transition: transform 0.15s; }
        .share-btn:hover { transform: scale(1.02); }
        .share-btn--copy { background: var(--card2); border: 1px solid var(--border); color: #fff; }
        .share-btn--copy.copied { background: rgba(0,230,118,0.15); border-color: rgba(0,230,118,0.3); color: var(--green); }
        .share-btn--share { background: var(--green); color: var(--black); }
        .share-tip { font-size: 13px; color: var(--gray); line-height: 1.5; margin-top: 16px; }
        .section-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; margin-bottom: 16px; }
        .request-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 12px; }
        .request-rider { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
        .request-detail { font-size: 13px; color: var(--gray-light); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
        .request-detail-label { color: var(--gray); min-width: 60px; }
        .request-price { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; color: var(--green); margin: 12px 0; }
        .request-actions { display: flex; gap: 10px; margin-top: 12px; }
        .req-btn { flex: 1; padding: 14px; border-radius: 100px; border: none; font-weight: 700; font-size: 15px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: transform 0.15s; }
        .req-btn:hover { transform: scale(1.02); }
        .req-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .req-btn--accept { background: var(--green); color: var(--black); }
        .req-btn--decline { background: var(--card2); border: 1px solid var(--border); color: #fff; }
        .empty-state { text-align: center; padding: 40px 20px; }
        .empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }
        .empty-text { font-size: 14px; color: var(--gray); line-height: 1.5; }
        .badge { display: inline-block; background: var(--green); color: var(--black); font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; margin-left: 8px; vertical-align: middle; }
        .areas-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 28px; }
        .area-tag { font-size: 12px; color: var(--gray-light); background: var(--card2); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; }
        .loading-dots { display: flex; gap: 4px; justify-content: center; padding: 40px 0; }
        .loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 1.2s ease-in-out infinite; }
        .loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.6)} }
      `}</style>

      <div className="driver-home">
        <h1 className="greeting">
          {displayName}
          {isHmuFirst
            ? <span className="badge">{'\uD83E\uDD47'} HMU 1st</span>
            : <span className="badge" style={{ background: '#1a1a1a', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>Free Tier</span>
          }
        </h1>
        <p className="greeting-sub">Your ride link is live</p>

        {areas.length > 0 && (
          <div className="areas-row">
            {areas.map((a) => (
              <span key={a} className="area-tag">{a}</span>
            ))}
          </div>
        )}

        {/* Launch Deal */}
        <DealCard />

        {/* Lifecycle Card */}
        {!payoutSetup && !cashOnly ? (
          /* SETUP: Link payout */
          <div style={{
            background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
            borderRadius: 20, padding: '24px 20px', marginBottom: 32,
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{'\uD83D\uDCB3'}</div>
            <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 24, lineHeight: 1, marginBottom: 6 }}>
              LINK YOUR PAYOUT ACCOUNT
            </div>
            <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 16 }}>
              Get paid same-day after your first ride. Cash App, Venmo, Zelle, or bank — always free.
            </p>
            <a
              href="/driver/payout-setup"
              style={{
                display: 'block', width: '100%', padding: 16, borderRadius: 100,
                border: 'none', background: '#00E676', color: '#080808',
                fontWeight: 700, fontSize: 16, textDecoration: 'none', textAlign: 'center',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Set Up Payouts
            </a>
          </div>
        ) : completedRides === 0 ? (
          /* READY: First ride */
          <div style={{
            background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
            borderRadius: 20, padding: '24px 20px', marginBottom: 32,
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{'\uD83D\uDE80'}</div>
            <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 24, lineHeight: 1, marginBottom: 6 }}>
              SHARE YOUR LINK. GET YOUR FIRST RIDE.
            </div>
            <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 16 }}>
              Your payout is ready. Now share your HMU link — drop it in group chats, IG bio, anywhere. Your first payout is one ride away.
            </p>
            <button
              onClick={handleShare}
              style={{
                display: 'block', width: '100%', padding: 16, borderRadius: 100,
                border: 'none', background: '#00E676', color: '#080808',
                fontWeight: 700, fontSize: 16, cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Share My HMU Link
            </button>
          </div>
        ) : completedRides <= 5 ? (
          /* GROWING: Keep going */
          <div style={{ marginBottom: 32 }}>
            <div style={{
              background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: 20, padding: '20px', marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 24, lineHeight: 1 }}>
                    {completedRides} RIDE{completedRides > 1 ? 'S' : ''} DONE {'\uD83D\uDD25'}
                  </div>
                  <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    Drivers who share their link get 3x more bookings
                  </p>
                </div>
              </div>
              <button
                onClick={handleShare}
                style={{
                  width: '100%', padding: 14, borderRadius: 100,
                  border: '1px solid rgba(0,230,118,0.3)', background: 'transparent',
                  color: '#00E676', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}
              >
                Share Link for More Rides
              </button>
            </div>
            <CashoutCard />
          </div>
        ) : (
          /* ESTABLISHED: Cashout + subtle upgrade */
          <div style={{ marginBottom: 32 }}>
            <CashoutCard />
            {!isHmuFirst && (
              <div style={{
                background: 'rgba(0,230,118,0.04)', border: '1px solid rgba(0,230,118,0.1)',
                borderRadius: 14, padding: '14px 18px', marginTop: 12,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 16 }}>{'\uD83E\uDD47'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.3 }}>
                    Drivers like you save ~$180/mo with <strong style={{ color: '#00E676' }}>HMU First</strong>
                  </div>
                </div>
                <a
                  href="/driver/settings?tab=hmu-first"
                  style={{ fontSize: 12, color: '#00E676', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                >
                  Learn more
                </a>
              </div>
            )}
          </div>
        )}

        {/* Share Link Card */}
        <div className="share-card">
          <p className="share-label">Your HMU Link</p>
          <div className="share-url-pill">{shareUrl}</div>
          <div className="share-buttons">
            <button
              className={`share-btn share-btn--copy${copied ? ' copied' : ''}`}
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <button className="share-btn share-btn--share" onClick={handleShare}>
              Share
            </button>
          </div>
          <p className="share-tip">
            Drop this anywhere — IG bio, group chats, Twitter. Riders tap it to book you.
          </p>
        </div>

        {/* Incoming Requests */}
        <h2 className="section-title">Incoming Requests</h2>

        {loadingRequests ? (
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        ) : requests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p className="empty-text">
              No requests yet — share your link to get started
            </p>
          </div>
        ) : (
          requests.map((req) => (
            <RequestCard key={req.id} req={req} actionLoading={actionLoading} onAction={handleAction} />
          ))
        )}
      </div>
    </>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RequestCard({ req, actionLoading, onAction }: {
  req: BookingRequest;
  actionLoading: string | null;
  onAction: (id: string, action: 'accept' | 'decline') => void;
}) {
  const [showRider, setShowRider] = useState(false);
  const [countdown, setCountdown] = useState('');

  // Countdown timer
  useEffect(() => {
    if (!req.expiresAt) return;
    const tick = () => {
      const remaining = new Date(req.expiresAt).getTime() - Date.now();
      if (remaining <= 0) { setCountdown('Expired'); return; }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${mins}:${String(secs).padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [req.expiresAt]);

  const isExpired = countdown === 'Expired';

  return (
    <div className="request-card" style={{ opacity: isExpired ? 0.5 : 1 }}>
      {/* Rider header — clickable */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button
          onClick={() => setShowRider(!showRider)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, background: 'none',
            border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
          }}
        >
          {/* Avatar */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
            background: '#1a1a1a', flexShrink: 0, border: '2px solid rgba(0,230,118,0.3)',
          }}>
            {req.riderAvatarUrl ? (
              <img src={req.riderAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#555' }}>
                {(req.riderName || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="request-rider" style={{ margin: 0 }}>
              {req.riderHandle ? `@${req.riderHandle}` : req.riderName}
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: req.riderOnline ? '#00E676' : '#555',
                display: 'inline-block', marginLeft: 6, verticalAlign: 'middle',
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              Tap to {showRider ? 'hide' : 'view'} rider details
            </div>
          </div>
        </button>

        {/* Countdown */}
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

      {/* Rider details — expandable */}
      {showRider && (
        <div style={{
          background: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 10,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
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
            <div style={{
              marginTop: 8, fontSize: 11, fontWeight: 700, color: '#4CAF50',
              background: 'rgba(76,175,80,0.1)', borderRadius: 100,
              padding: '4px 10px', display: 'inline-block',
            }}>
              Cash Ride
            </div>
          )}
        </div>
      )}

      {/* Ride details */}
      <div className="request-detail">
        <span className="request-detail-label">Where</span>
        {req.destination || 'Not specified'}
      </div>
      <div className="request-detail">
        <span className="request-detail-label">When</span>
        {req.time || 'ASAP'}
      </div>
      {req.stops && req.stops !== 'none' && req.stops !== 'Nah, straight there' && (
        <div className="request-detail">
          <span className="request-detail-label">Stops</span>
          {req.stops}
        </div>
      )}
      {req.roundTrip && (
        <div className="request-detail">
          <span className="request-detail-label">Trip</span>
          Round trip
        </div>
      )}
      <div className="request-price">${req.price}</div>

      {/* Actions */}
      {!isExpired && (
        <div className="request-actions">
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
            Accept
          </button>
        </div>
      )}
    </div>
  );
}
