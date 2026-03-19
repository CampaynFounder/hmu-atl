'use client';

import { useCallback, useEffect, useState } from 'react';
import CashoutCard from '@/components/driver/cashout-card';

interface BookingRequest {
  id: string;
  riderName: string;
  destination: string;
  time: string;
  stops: string;
  roundTrip: boolean;
  price: number;
  expiresAt: string;
}

interface Props {
  handle: string;
  displayName: string;
  shareUrl: string;
  areas: string[];
  pricing: Record<string, unknown>;
  isHmuFirst: boolean;
}

export default function DriverHomeClient({
  handle,
  displayName,
  shareUrl,
  areas,
  isHmuFirst,
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

  const handleShare = async () => {
    const shareData = {
      title: `Book ${displayName} on HMU ATL`,
      text: `Need a ride in ATL? Book me directly:`,
      url: `https://${shareUrl}`,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or share failed — fall back to copy
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleAction = async (postId: string, action: 'accept' | 'decline') => {
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/bookings/${postId}/${action}`, { method: 'POST' });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== postId));
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
            ? <span className="badge">{'\uD83E\uDD47'} HMU First</span>
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

        {/* Cash Out */}
        <CashoutCard />

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
            <div key={req.id} className="request-card">
              <div className="request-rider">{req.riderName}</div>
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
              <div className="request-actions">
                <button
                  className="req-btn req-btn--decline"
                  onClick={() => handleAction(req.id, 'decline')}
                  disabled={actionLoading === req.id}
                >
                  Decline
                </button>
                <button
                  className="req-btn req-btn--accept"
                  onClick={() => handleAction(req.id, 'accept')}
                  disabled={actionLoading === req.id}
                >
                  Accept
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
