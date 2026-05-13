'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { useAbly } from '@/hooks/use-ably';
import CashoutCard from '@/components/driver/cashout-card';
import { ViewsCard } from '@/components/driver/views-card';
import { PendingActionBanner } from '@/components/pending-action-banner';
import PassReasonSheet, { type PassReason } from '@/components/driver/pass-reason-sheet';

interface BookingRequest {
  id: string;
  type?: string;
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
  marketSlug: string;
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
  marketSlug,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingPassPostId, setPendingPassPostId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [focusedPostId, setFocusedPostId] = useState<string | null>(null);
  const [newRequestIds, setNewRequestIds] = useState<Set<string>>(new Set());
  const [exitDirs, setExitDirs] = useState<Record<string, 'left' | 'right'>>({});
  const initialLoadDone = useRef(false);

  const searchParams = useSearchParams();
  const focusParam = searchParams.get('focus');

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers/requests');
      if (res.ok) {
        const data = await res.json();
        const incoming: BookingRequest[] = data.requests ?? [];

        // First load: skip the glide-in/glow so we don't fanfare requests that
        // were already sitting there. Subsequent fetches diff against current
        // state and flag anything whose id wasn't present before.
        if (!initialLoadDone.current) {
          setRequests(incoming);
          initialLoadDone.current = true;
        } else {
          setRequests((prev) => {
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
              // Drop the "new" flag after the glow finishes so a future status
              // change on this card doesn't re-trigger the animation.
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
      }
    } catch {
      // silent fail — will retry on next poll
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // Initial load — Ably handles real-time updates, visibility change handles tab return
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Re-fetch immediately on any Ably notification (cancelled ride, new request, etc.)
  const handleAblyMessage = useCallback(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Local prune when a request's countdown hits 0. Time-based expiry has no
  // server event (no cron flips status on the second), so the next refetch
  // would already drop it server-side — this just gets it off the screen
  // immediately. Brief delay so the driver sees the "Expired" flash first.
  const handleRequestExpired = useCallback((postId: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== postId));
  }, []);

  useAbly({
    channelName: `user:${userId}:notify`,
    onMessage: handleAblyMessage,
  });

  // Also subscribe to the market feed — drives a refetch when posts change
  // status across the market (rider cancels-after-decline → locked preview
  // disappears, rider broadcasts → preview becomes active rider_request,
  // etc). Without this, /driver/home would stay stale until visibility
  // change or the next personal notify event.
  useAbly({
    channelName: `market:${marketSlug}:feed`,
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

  // Focus + pulse a specific request when the driver lands here from the
  // pending-action banner's Respond button. Waits until requests have loaded
  // (or the param matches a request that's already in state) before scrolling
  // so the target element actually exists in the DOM.
  useEffect(() => {
    if (!focusParam) return;
    const target = requests.find((r) => r.id === focusParam);
    if (!target) return;
    setFocusedPostId(focusParam);
    // Two RAFs to ensure layout has settled after request render.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`request-${focusParam}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const timer = setTimeout(() => setFocusedPostId(null), 2400);
    return () => clearTimeout(timer);
  }, [focusParam, requests]);

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
    // Pass routes through the reason sheet — same payload contract as /driver/feed
    // so riders see the reason chip + note on the "driver passed" card.
    if (action === 'decline') {
      setPendingPassPostId(postId);
      return;
    }
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/bookings/${postId}/accept`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        // Accept = throw card right. Two-tick dance: set direction first, then
        // defer removal so React flushes the new exit variant into
        // AnimatePresence's cache BEFORE the card unmounts. Without the defer,
        // both state updates batch into one render and AP captures the prior
        // (undefined) exit prop — card disappears with no throw.
        setExitDirs((d) => ({ ...d, [postId]: 'right' }));
        setTimeout(() => {
          setRequests((prev) => prev.filter((r) => r.id !== postId));
          if (data.rideId) {
            // Let the throw animate before navigating off the page.
            setTimeout(() => window.location.replace(`/ride/${data.rideId}`), 560);
          }
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
        // Pass = throw card left. Defer removal one tick so AnimatePresence
        // captures the new exit variant — see handleAction for the rationale.
        setExitDirs((d) => ({ ...d, [postId]: 'left' }));
        setTimeout(() => {
          setRequests((prev) => prev.filter((r) => r.id !== postId));
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
        .driver-home { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding: 72px 20px 100px; }
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

        /* Brand-green glow that fires once when a new request lands. The ring
           is brightest at 0%, softens by 60%, fully fades by 100%. Pairs with
           the framer glide-in for a layered "this is fresh" cue. */
        @keyframes newRequestGlow {
          0%   { box-shadow: 0 0 0 2px rgba(0,230,118,0.8), 0 0 44px rgba(0,230,118,0.6); }
          40%  { box-shadow: 0 0 0 2px rgba(0,230,118,0.7), 0 0 38px rgba(0,230,118,0.45); }
          70%  { box-shadow: 0 0 0 1px rgba(0,230,118,0.35), 0 0 22px rgba(0,230,118,0.25); }
          100% { box-shadow: 0 0 0 0 rgba(0,230,118,0), 0 0 0 rgba(0,230,118,0); }
        }
        .request-card.is-new {
          animation: newRequestGlow 2.8s ease-out forwards;
        }

        /* First-load shimmer — a soft sheen sweeps each primary CTA twice then
           stops. Works on any button with .shimmer-once. The ::after gives us
           a gradient overlay without disturbing button content. */
        .shimmer-once { position: relative; overflow: hidden; }
        .shimmer-once::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmerSweep 1.6s ease-out 2;
          pointer-events: none;
        }
        @keyframes shimmerSweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Collapsed "no requests" pill — keeps the cashout card above the fold. */
        .empty-collapsed {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; margin-bottom: 24px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .empty-collapsed-label { font-size: 13px; color: var(--gray-light); display: flex; align-items: center; gap: 8px; }
        .empty-collapsed-expand { font-size: 11px; font-weight: 600; color: var(--green); cursor: pointer; background: transparent; border: none; padding: 4px 8px; }
      `}</style>

      <div className="driver-home">
        {/* Pending actions */}
        <div style={{ paddingTop: 8 }}>
          <PendingActionBanner maxActions={3} />
        </div>

        <motion.h1
          className="greeting"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {displayName}
          {isHmuFirst
            ? <span className="badge">{'\uD83E\uDD47'} HMU 1st</span>
            : <span className="badge" style={{ background: '#1a1a1a', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>Free Tier</span>
          }
        </motion.h1>
        <motion.p
          className="greeting-sub"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1], delay: 0.08 }}
        >
          Your ride link is live
        </motion.p>

        {areas.length > 0 && (
          <motion.div
            className="areas-row"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.16 }}
          >
            {areas.map((a) => (
              <span key={a} className="area-tag">{a}</span>
            ))}
          </motion.div>
        )}

        {/* Profile-views growth card — self-hides when there are zero views */}
        <ViewsCard />

        {/* Incoming Requests — collapse the section entirely when empty so the
            cashout card sits above the fold for new drivers. Loading still
            shows the dots; requests still render as cards. */}
        {loadingRequests ? (
          <>
            <h2 className="section-title">Incoming Requests</h2>
            <div className="loading-dots">
              <div className="loading-dot" />
              <div className="loading-dot" />
              <div className="loading-dot" />
            </div>
          </>
        ) : requests.length === 0 ? (
          <EmptyRequestsCollapsed />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
          >
            <h2 className="section-title">Incoming Requests</h2>
            <AnimatePresence initial={false}>
              {requests.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  actionLoading={actionLoading}
                  onAction={handleAction}
                  focused={focusedPostId === req.id}
                  isNew={newRequestIds.has(req.id)}
                  exitDir={exitDirs[req.id]}
                  onExpired={handleRequestExpired}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Lifecycle Card — fade-up on mount; primary CTAs get a one-shot shimmer */}
        {!payoutSetup && !cashOnly ? (
          /* SETUP: Link payout */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay: 0.28 }}
            style={{
              background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: 20, padding: '24px 20px', marginBottom: 32,
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{'\uD83D\uDCB3'}</div>
            <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 24, lineHeight: 1, marginBottom: 6 }}>
              LINK YOUR PAYOUT ACCOUNT
            </div>
            <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 16 }}>
              Get paid same-day after your first ride. Cash App, Venmo, Zelle, or bank — always free.
            </p>
            <a
              href="/driver/payout-setup"
              className="shimmer-once"
              style={{
                display: 'block', width: '100%', padding: 16, borderRadius: 100,
                border: 'none', background: '#00E676', color: '#080808',
                fontWeight: 700, fontSize: 16, textDecoration: 'none', textAlign: 'center',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Set Up Payouts
            </a>
          </motion.div>
        ) : completedRides === 0 ? (
          /* READY: First ride — show cashout card + share prompt */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay: 0.28 }}
            style={{ marginBottom: 32 }}
          >
            <CashoutCard />
            <div style={{
              background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: 20, padding: '24px 20px', marginTop: 12,
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{'\uD83D\uDE80'}</div>
              <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 24, lineHeight: 1, marginBottom: 6 }}>
                SHARE YOUR LINK. GET MORE RIDES.
              </div>
              <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 16 }}>
                Drop your HMU link in group chats, IG bio, anywhere. More visibility = more bookings.
              </p>
              <button
                onClick={handleShare}
                className="shimmer-once"
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
          </motion.div>
        ) : completedRides <= 5 ? (
          /* GROWING: Cashout first, then milestone */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay: 0.28 }}
            style={{ marginBottom: 32 }}
          >
            <CashoutCard />
            <div style={{
              background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: 20, padding: '16px 20px', marginTop: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 22, lineHeight: 1 }}>
                  {completedRides} RIDE{completedRides > 1 ? 'S' : ''} DONE {'\uD83D\uDD25'}
                </div>
                <p style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  Keep going — share your link for more
                </p>
              </div>
              <button
                onClick={handleShare}
                style={{
                  padding: '10px 16px', borderRadius: 100,
                  border: '1px solid rgba(0,230,118,0.3)', background: 'transparent',
                  color: '#00E676', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)", flexShrink: 0,
                }}
              >
                Share
              </button>
            </div>
          </motion.div>
        ) : (
          /* ESTABLISHED: Cashout + subtle upgrade */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay: 0.28 }}
            style={{ marginBottom: 32 }}
          >
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
          </motion.div>
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

function EmptyRequestsCollapsed() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <motion.div
        className="empty-collapsed"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
      >
        <span className="empty-collapsed-label">
          {'\uD83D\uDCED'} No incoming requests
        </span>
        <button type="button" className="empty-collapsed-expand" onClick={() => setOpen(true)}>
          Expand
        </button>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Incoming Requests</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="empty-collapsed-expand"
          style={{ fontSize: 12 }}
        >
          Collapse
        </button>
      </h2>
      <div className="empty-state">
        <div className="empty-icon">{'\uD83D\uDCED'}</div>
        <p className="empty-text">No requests yet — share your link to get started.</p>
      </div>
    </motion.div>
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

function RequestCard({ req, actionLoading, onAction, focused, isNew, exitDir, onExpired }: {
  req: BookingRequest;
  actionLoading: string | null;
  onAction: (id: string, action: 'accept' | 'decline') => void;
  focused?: boolean;
  isNew?: boolean;
  exitDir?: 'left' | 'right';
  onExpired?: (postId: string) => void;
}) {
  const [showRider, setShowRider] = useState(false);
  const [countdown, setCountdown] = useState('');

  // Countdown timer. When it hits 0 we briefly show "Expired" then call
  // onExpired so the parent prunes the card from state.
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

  return (
    <motion.div
      id={`request-${req.id}`}
      className={`request-card${isNew ? ' is-new' : ''}`}
      layout
      initial={{ opacity: 0, y: -44, scale: 0.9 }}
      animate={{ opacity: isExpired ? 0.5 : 1, y: 0, scale: 1 }}
      exit={exitVariant}
      transition={{ type: 'spring', stiffness: 180, damping: 22, mass: 1.05 }}
      style={{
        ...(focused && !isNew ? {
          boxShadow: '0 0 0 2px rgba(255,145,0,0.85), 0 0 32px rgba(255,145,0,0.45)',
          transition: 'box-shadow 0.3s ease-out',
        } : !isNew ? { transition: 'box-shadow 0.6s ease-out' } : {}),
      }}
    >
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
              marginTop: 8, fontSize: 11, fontWeight: 700, color: '#FFC107',
              background: 'rgba(255,193,7,0.12)', borderRadius: 100,
              padding: '4px 10px', display: 'inline-block',
            }}>
              💵 Cash Ride
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="request-price" style={{ margin: 0 }}>${req.price}</div>
        {req.isCash && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#FFC107',
            background: 'rgba(255,193,7,0.12)', borderRadius: 100,
            padding: '4px 10px',
          }}>
            💵 Cash
          </span>
        )}
      </div>

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
            {req.type === 'direct' ? 'Accept' : 'HMU'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
