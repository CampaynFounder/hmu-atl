'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAbly } from '@/hooks/use-ably';
import { posthog } from '@/components/analytics/posthog-provider';
import DriverProfileOverlay from '@/components/driver/driver-profile-overlay';

interface Props {
  displayName: string;
  userId: string;
}

interface PostedRequest {
  id: string;
  type?: string;
  message: string;
  price: number;
  status: string;
  isCash?: boolean;
  driverName?: string | null;
  driverHandle?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface InterestedDriver {
  interestId: string;
  driverUserId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  videoUrl: string | null;
  chillScore: number;
  completedRides: number;
  tier: string;
  fwu: boolean;
  lgbtqFriendly: boolean;
  priceOffered: number;
  interestedAt: string;
}

interface MatchNotification {
  rideId: string;
  driverName?: string;
  price?: number;
  message?: string;
  needsPayment?: boolean;
}

const ACTIVE_STATUSES = ['active', 'matched'];

export default function RiderFeedClient({ displayName, userId }: Props) {
  const [input, setInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [viewingDriverHandle, setViewingDriverHandle] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostedRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCash, setIsCash] = useState(false);
  const [matchNotif, setMatchNotif] = useState<MatchNotification | null>(null);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [interestedDrivers, setInterestedDrivers] = useState<Map<string, InterestedDriver[]>>(new Map());
  const [selectingDriver, setSelectingDriver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activePosts = posts.filter(p => ACTIVE_STATUSES.includes(p.status));
  const pastPosts = posts.filter(p => !ACTIVE_STATUSES.includes(p.status));
  // Only trust the API for active ride status — post status can be stale
  const hasActiveRide = !!activeRideId;

  // Ably subscription for real-time notifications
  const handleAblyMessage = useCallback((msg: { name: string; data: unknown; timestamp?: number }) => {
    // Ably rewinds the last 2 minutes of messages on reconnect. Suppress
    // replayed events so the match overlay doesn't re-fire on navigation
    // back to /rider/home after a ride has already completed.
    if (msg.timestamp && Date.now() - msg.timestamp > 30 * 1000) {
      return;
    }

    const data = msg.data as Record<string, unknown>;
    // The match overlay should ONLY fire for the initial driver-accepted event,
    // not for subsequent ride_update events (otw, here, ended, etc.). Previously
    // this fired for every ride_update — causing "DRIVER FOUND!" + "Link payment"
    // to appear AFTER a ride already ended because /api/rides/[id]/end publishes
    // a ride_update with status='ended' to the rider's notify channel.
    const status = (data.status as string | undefined) || null;
    const isInitialMatch =
      msg.name === 'booking_accepted' ||
      (msg.name === 'ride_update' && (status === 'matched' || status === 'accepted'));

    if (isInitialMatch) {
      const rideId = data.rideId as string;
      if (rideId) {
        setMatchNotif({
          rideId,
          driverName: data.driverName as string,
          price: data.price as number,
          message: (data.message as string) || 'A driver accepted your ride!',
        });
        if (data.postId) {
          setPosts(prev => prev.map(p => p.id === data.postId ? { ...p, status: 'matched' } : p));
        }
        // Cash rides don't need payment check
        const isCashRide = data.isCash === true;
        if (isCashRide) {
          setTimeout(() => { window.location.replace(`/ride/${rideId}`); }, 2500);
        } else {
          fetch('/api/rider/payment-methods')
            .then(r => r.json())
            .then(pmData => {
              if (pmData.methods && pmData.methods.length > 0) {
                setTimeout(() => { window.location.replace(`/ride/${rideId}`); }, 2500);
              } else {
                setMatchNotif(prev => prev ? { ...prev, needsPayment: true } : null);
              }
            })
            .catch(() => {
              if (rideId) setTimeout(() => { window.location.replace(`/ride/${rideId}`); }, 3000);
            });
        }
      }
    }
    if (msg.name === 'driver_interested') {
      const postId = data.postId as string;
      const driver: InterestedDriver = {
        interestId: '',
        driverUserId: data.driverUserId as string,
        handle: (data.driverHandle as string) || null,
        displayName: (data.driverName as string) || 'Driver',
        avatarUrl: null,
        videoUrl: (data.driverVideoUrl as string) || null,
        chillScore: 0,
        completedRides: 0,
        tier: 'free',
        fwu: false,
        lgbtqFriendly: false,
        priceOffered: Number(data.price || 0),
        interestedAt: new Date().toISOString(),
      };
      setInterestedDrivers(prev => {
        const next = new Map(prev);
        const existing = next.get(postId) || [];
        if (!existing.find(d => d.driverUserId === driver.driverUserId)) {
          next.set(postId, [...existing, driver]);
        }
        return next;
      });
    }
  }, []);

  // Fetch interested drivers for active posts
  useEffect(() => {
    const active = posts.filter(p => p.status === 'active' && p.type !== 'direct');
    for (const post of active) {
      fetch(`/api/bookings/${post.id}/select`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.drivers?.length) {
            setInterestedDrivers(prev => {
              const next = new Map(prev);
              next.set(post.id, data.drivers);
              return next;
            });
          }
        })
        .catch(() => {});
    }
  }, [posts]);

  useAbly({
    channelName: userId ? `user:${userId}:notify` : null,
    onMessage: handleAblyMessage,
  });

  // Check for active ride on mount
  useEffect(() => {
    const pendingRide = localStorage.getItem('hmu_pending_ride');
    if (pendingRide) {
      localStorage.removeItem('hmu_pending_ride');
      if (pendingRide && pendingRide !== 'undefined' && pendingRide !== 'null') {
        window.location.replace(`/ride/${pendingRide}`);
      }
      return;
    }
    fetch('/api/rides/active')
      .then(r => r.json())
      .then(data => {
        if (data.hasActiveRide && data.rideId) {
          setActiveRideId(data.rideId);
        } else {
          // No active ride — clear any stale matched posts from local state
          setPosts(prev => prev.map(p => p.status === 'matched' ? { ...p, status: 'expired' } : p));
        }
      })
      .catch(() => {});
  }, []);

  // Load existing posts
  useEffect(() => {
    fetch('/api/rider/posts')
      .then(r => r.json())
      .then(data => { if (data.posts) setPosts(data.posts); })
      .catch(() => {});
  }, []);

  async function handleDelete(postId: string) {
    try {
      const res = await fetch(`/api/rider/posts?postId=${postId}`, { method: 'DELETE' });
      if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId));
    } catch { /* silent */ }
  }

  async function handlePost() {
    const text = input.trim();
    if (!text) return;
    const priceMatch = text.match(/\$(\d+)/);
    const price = priceMatch ? parseInt(priceMatch[1]) : 0;
    if (price < 1) {
      setError('Include a price (e.g. "midtown > airport $25")');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/rider/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, price, is_cash: isCash }),
      });
      const data = await res.json();
      if (res.ok) {
        posthog.capture('ride_request_posted', { price, message: text });
        setPosts(prev => [{ id: data.postId, type: 'open', message: text, price, status: 'active', createdAt: new Date().toISOString() }, ...prev]);
        setInput('');
      } else {
        setError(data.error || 'Failed to post');
      }
    } catch {
      setError('Network error');
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .rf { background: var(--black); min-height: 100svh; color: #fff; font-family: var(--font-body, 'DM Sans', sans-serif); padding-top: 56px; }
        .rf-header { padding: 20px 20px 0; }
        .rf-greeting { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; line-height: 1.1; margin-bottom: 4px; }
        .rf-sub { font-size: 14px; color: var(--gray); margin-bottom: 20px; }
        .rf-composer { padding: 0 20px 16px; position: relative; }
        .rf-input-wrap { display: flex; gap: 10px; align-items: center; }
        .rf-input { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: 100px; padding: 16px 20px; color: #fff; font-size: 16px; outline: none; font-family: var(--font-body, 'DM Sans', sans-serif); transition: border-color 0.2s; }
        .rf-input:focus { border-color: var(--green); }
        .rf-input::placeholder { color: #555; }
        .rf-send { width: 50px; height: 50px; border-radius: 50%; border: none; background: var(--green); color: var(--black); font-size: 20px; font-weight: 700; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .rf-send:hover { transform: scale(1.05); }
        .rf-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .rf-error { font-size: 13px; color: #FF5252; margin-top: 8px; padding: 0 4px; }
        .rf-section { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; padding: 20px 20px 10px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      <div className="rf">
        <div className="rf-header">
          <h1 className="rf-greeting">Where you headed, @{displayName}?</h1>
          <p className="rf-sub">Post what you need. Drivers online now sayin HMU.</p>
        </div>

        {/* Composer */}
        <div className="rf-composer">
          {hasActiveRide ? (
            <div
              onClick={() => {
                if (activeRideId) {
                  window.location.href = `/ride/${activeRideId}`;
                } else {
                  fetch('/api/rides/active')
                    .then(r => r.json())
                    .then(data => {
                      if (data.hasActiveRide && data.rideId) {
                        setActiveRideId(data.rideId);
                        window.location.href = `/ride/${data.rideId}`;
                      }
                    })
                    .catch(() => {});
                }
              }}
              style={{
                display: 'block',
                background: activeRideId ? 'rgba(0,230,118,0.08)' : 'rgba(68,138,255,0.08)',
                border: `1px solid ${activeRideId ? 'rgba(0,230,118,0.25)' : 'rgba(68,138,255,0.2)'}`,
                borderRadius: 16, padding: '14px 18px', lineHeight: 1.4,
                cursor: activeRideId ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: activeRideId ? '#00E676' : '#448AFF', marginBottom: 4 }}>
                {activeRideId ? 'You have an active ride' : 'Ride matched — waiting on driver'}
              </div>
              <div style={{ fontSize: 13, color: '#bbb' }}>
                {activeRideId ? 'Tap here to view your ride \u2192' : 'We\u2019ll notify you when they\u2019re OTW.'}
              </div>
            </div>
          ) : (
            <>
              <div className="rf-input-wrap">
                <input
                  ref={inputRef}
                  className="rf-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePost()}
                  placeholder="e.g. buckhead > airport $25"
                  disabled={posting}
                />
                <button className="rf-send" onClick={handlePost} disabled={posting || !input.trim()}>
                  {posting ? '...' : '\u2191'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setIsCash(!isCash)}
                  style={{
                    padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    background: isCash ? 'rgba(76,175,80,0.15)' : '#1a1a1a',
                    color: isCash ? '#4CAF50' : '#888',
                    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    transition: 'all 0.15s',
                  }}
                >
                  {'\uD83D\uDCB5'} {isCash ? 'Cash Ride' : 'Cash?'}
                </button>
              </div>
            </>
          )}
          {error && <div className="rf-error">{error}</div>}
        </div>

        {/* My Rides quick link */}
        <a
          href="/rider/settings?tab=history"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '14px 20px', margin: '0 20px 12px',
            textDecoration: 'none', color: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{'\uD83D\uDCCB'}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>My Rides</span>
          </div>
          <span style={{ fontSize: 13, color: '#00E676' }}>{'\u2192'}</span>
        </a>

        {/* How it works tip */}
        {posts.length === 0 && (
          <div style={{
            background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '16px 20px', margin: '0 20px 12px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00E676', marginBottom: 4 }}>How it works</div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
              Post where you&apos;re going and your price. Drivers see your request and tap HMU. You can also browse and HMU drivers directly.
            </div>
          </div>
        )}

        {/* ── ACTIVE REQUESTS ── */}
        {activePosts.length > 0 && (
          <>
            <div className="rf-section">Active ({activePosts.length})</div>
            {activePosts.map(post => {
              const drivers = interestedDrivers.get(post.id) || [];
              return (
                <div key={post.id}>
                  <ActivePostCard
                    post={post}
                    displayName={displayName}
                    onDelete={handleDelete}
                  />
                  {/* Interested drivers for this post */}
                  {post.status === 'active' && drivers.length > 0 && (
                    <div style={{ margin: '0 20px 12px' }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                        color: '#00E676', padding: '0 4px 6px',
                        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                      }}>
                        {drivers.length} DRIVER{drivers.length > 1 ? 'S' : ''} INTERESTED
                      </div>
                      {drivers.map(driver => (
                        <div
                          key={driver.driverUserId}
                          style={{
                            background: '#141414', border: '1px solid rgba(0,230,118,0.15)',
                            borderRadius: 16, padding: '12px 16px', marginBottom: 8,
                            display: 'flex', alignItems: 'center', gap: 12,
                          }}
                        >
                          {/* Avatar or video thumbnail */}
                          <div style={{
                            width: 48, height: 48, borderRadius: 12, overflow: 'hidden',
                            background: '#1a1a1a', flexShrink: 0,
                          }}>
                            {driver.videoUrl ? (
                              <video src={driver.videoUrl} muted playsInline preload="metadata"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : driver.avatarUrl ? (
                              <img src={driver.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#444' }}>
                                {(driver.displayName || 'D').charAt(0)}
                              </div>
                            )}
                          </div>

                          {/* Driver info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                                {driver.handle ? `@${driver.handle}` : driver.displayName}
                              </span>
                              {driver.tier === 'hmu_first' && (
                                <span style={{ fontSize: 9, background: 'rgba(0,230,118,0.15)', color: '#00E676', padding: '1px 6px', borderRadius: 100, fontWeight: 700 }}>1ST</span>
                              )}
                              {driver.fwu && (
                                <span style={{ fontSize: 9, background: 'rgba(156,39,176,0.15)', color: '#CE93D8', padding: '1px 6px', borderRadius: 100, fontWeight: 700 }}>FWU</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                              {driver.chillScore > 0 && <span style={{ color: '#00E676', fontWeight: 600 }}>{driver.chillScore}% Chill</span>}
                              {driver.completedRides > 0 && <span> · {driver.completedRides} rides</span>}
                            </div>
                          </div>

                          {/* Select button */}
                          <button
                            disabled={selectingDriver}
                            onClick={async () => {
                              setSelectingDriver(true);
                              try {
                                const res = await fetch(`/api/bookings/${post.id}/select`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ driverUserId: driver.driverUserId }),
                                });
                                const data = await res.json();
                                if (data.rideId) {
                                  setMatchNotif({
                                    rideId: data.rideId,
                                    driverName: driver.handle || driver.displayName,
                                    price: post.price,
                                    message: `Matched with ${driver.handle || driver.displayName}!`,
                                  });
                                  setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'matched' } : p));
                                  setTimeout(() => { window.location.replace(`/ride/${data.rideId}`); }, 2500);
                                } else {
                                  setError(data.error || 'Failed to select driver');
                                }
                              } catch { setError('Network error'); }
                              setSelectingDriver(false);
                            }}
                            style={{
                              padding: '8px 16px', borderRadius: 100, border: 'none',
                              background: '#00E676', color: '#000', fontSize: 13, fontWeight: 700,
                              cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                              flexShrink: 0, opacity: selectingDriver ? 0.5 : 1,
                            }}
                          >
                            HMU
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {post.status === 'active' && drivers.length === 0 && post.type !== 'direct' && (
                    <div style={{
                      margin: '0 20px 12px', padding: '8px 14px',
                      fontSize: 12, color: '#555', textAlign: 'center',
                    }}>
                      Waiting for drivers to express interest...
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── PAST REQUESTS (collapsible) ── */}
        {pastPosts.length > 0 && (
          <>
            <button
              onClick={() => setPastExpanded(!pastExpanded)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '14px 20px', margin: '8px 0 0',
                background: 'none', border: 'none', cursor: 'pointer', color: '#888',
                fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                fontSize: 10, letterSpacing: 3, textTransform: 'uppercase',
              }}
            >
              <span>Past ({pastPosts.length})</span>
              <span style={{ fontSize: 14, transition: 'transform 0.2s', transform: pastExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                {'\u25BE'}
              </span>
            </button>

            {!pastExpanded ? (
              /* Collapsed: compact summary rows */
              <div style={{ padding: '0 20px 8px' }}>
                {pastPosts.slice(0, 5).map(post => (
                  <div key={post.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <StatusDot status={post.status} expiresAt={post.expiresAt} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: '#bbb', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {post.type === 'direct' && post.driverHandle
                          ? <span onClick={(e) => { e.stopPropagation(); setViewingDriverHandle(post.driverHandle!); }} style={{ color: '#448AFF', cursor: 'pointer' }}>@{post.driverHandle}</span>
                          : null}
                        {post.type === 'direct' && post.driverHandle ? ' ' : ''}
                        {post.message || 'Ride request'}
                      </div>
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                      fontSize: 13, fontWeight: 700, color: '#555', flexShrink: 0,
                    }}>
                      ${post.price}
                    </div>
                    <div style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>
                      {statusLabel(post.status)}
                    </div>
                  </div>
                ))}
                {pastPosts.length > 5 && (
                  <button
                    onClick={() => setPastExpanded(true)}
                    style={{
                      display: 'block', width: '100%', padding: '8px 0',
                      background: 'none', border: 'none', color: '#00E676',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    }}
                  >
                    Show all {pastPosts.length} past requests
                  </button>
                )}
              </div>
            ) : (
              /* Expanded: full cards */
              <div style={{ padding: '0 20px 8px' }}>
                {pastPosts.map(post => (
                  <div key={post.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <StatusDot status={post.status} expiresAt={post.expiresAt} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: '#bbb', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {post.type === 'direct' && post.driverHandle
                          ? <span onClick={(e) => { e.stopPropagation(); setViewingDriverHandle(post.driverHandle!); }} style={{ color: '#448AFF', cursor: 'pointer' }}>@{post.driverHandle}</span>
                          : null}
                        {post.type === 'direct' && post.driverHandle ? ' ' : ''}
                        {post.message || 'Ride request'}
                      </div>
                      <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        {getTimeAgo(post.createdAt)}
                      </div>
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                      fontSize: 13, fontWeight: 700, color: '#555', flexShrink: 0,
                    }}>
                      ${post.price}
                    </div>
                    <div style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>
                      {statusLabel(post.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>{'\uD83D\uDE97'}</div>
            <div style={{ fontSize: 15, color: '#888', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
              Post your first ride request above. Type where you&apos;re going and include a price.
            </div>
          </div>
        )}

        {/* Browse drivers link */}
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <Link
            href="/rider/browse"
            style={{
              display: 'inline-block', padding: '12px 24px', borderRadius: 100,
              border: '1px solid rgba(0,230,118,0.2)', color: '#00E676',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            Browse available drivers
          </Link>
        </div>
      </div>

      {/* Match notification overlay */}
      {matchNotif && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'matchFadeIn 0.3s ease-out',
        }}>
          <style>{`
            @keyframes matchFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes matchPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
            @keyframes matchBounce { 0% { transform: scale(0); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
          `}</style>

          <div style={{ animation: 'matchBounce 0.5s ease-out', marginBottom: 20 }}>
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              background: 'rgba(0,230,118,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 70, height: 70, borderRadius: '50%',
                background: '#00E676', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 32,
              }}>
                {'\uD83D\uDE97'}
              </div>
            </div>
          </div>

          <h2 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 36, color: '#fff', textAlign: 'center', marginBottom: 8,
            animation: 'matchPulse 2s ease-in-out infinite',
          }}>
            DRIVER FOUND!
          </h2>

          <p style={{ fontSize: 16, color: '#00E676', fontWeight: 600, marginBottom: 4 }}>
            {matchNotif.message}
          </p>

          {matchNotif.price && (
            <p style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 48, color: '#00E676', margin: '12px 0',
            }}>
              ${matchNotif.price}
            </p>
          )}

          {matchNotif.needsPayment ? (
            <>
              <p style={{ fontSize: 14, color: '#FFB300', fontWeight: 600, marginTop: 16, textAlign: 'center' }}>
                Link a payment method to confirm your ride
              </p>
              <p style={{ fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' }}>
                Add payment quickly before driver moves on
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/rider/payment-methods/checkout', { method: 'POST' });
                    const data = await res.json();
                    if (data.url) {
                      localStorage.setItem('hmu_pending_ride', matchNotif.rideId);
                      window.location.href = data.url;
                    }
                  } catch { /* silent */ }
                }}
                style={{
                  width: '100%', maxWidth: 300, padding: 16, marginTop: 16,
                  borderRadius: 100, border: 'none', background: '#00E676',
                  color: '#080808', fontWeight: 800, fontSize: 16, cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}
              >
                Link Payment — One Tap
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#888', marginTop: 16 }}>Loading your ride...</p>
              <div style={{
                width: 40, height: 40, border: '3px solid rgba(0,230,118,0.3)',
                borderTopColor: '#00E676', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', marginTop: 12,
              }} />
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {viewingDriverHandle && (
        <DriverProfileOverlay
          handle={viewingDriverHandle}
          open={true}
          onClose={() => setViewingDriverHandle(null)}
        />
      )}
    </>
  );
}

// ── Active post card (full size) ──
function ActivePostCard({
  post,
  displayName,
  onDelete,
}: {
  post: PostedRequest;
  displayName: string;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{
      background: '#141414', border: post.status === 'matched' ? '1px solid rgba(68,138,255,0.3)' : '1px solid rgba(0,230,118,0.2)',
      borderRadius: 20, padding: '16px 20px', margin: '0 20px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {post.type === 'direct' ? (
            <span style={{ fontSize: 11, background: 'rgba(68,138,255,0.15)', color: '#448AFF', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>
              Direct
            </span>
          ) : (
            <span style={{ fontSize: 11, background: 'rgba(0,230,118,0.1)', color: '#00E676', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>
              Open
            </span>
          )}
          {post.isCash && (
            <span style={{ fontSize: 11, background: 'rgba(255,193,7,0.15)', color: '#FFC107', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>
              Cash
            </span>
          )}
          {post.driverHandle && (
            <Link href={`/d/${post.driverHandle}`} style={{ fontSize: 13, color: '#448AFF', textDecoration: 'none', fontWeight: 600 }}>
              @{post.driverHandle}
            </Link>
          )}
          <span style={{ fontSize: 12, color: '#888' }}>{getTimeAgo(post.createdAt)}</span>
        </div>
        {post.status === 'active' && (
          <button
            onClick={() => onDelete(post.id)}
            style={{
              background: 'none', border: 'none', color: '#FF5252',
              fontSize: 12, cursor: 'pointer', padding: '2px 6px',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Cancel
          </button>
        )}
      </div>

      <div style={{ fontSize: 16, lineHeight: 1.4, marginBottom: 8 }}>{post.message}</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 32, color: '#00E676', lineHeight: 1,
        }}>
          ${post.price}
        </div>
        {post.status === 'matched' ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '4px 12px', borderRadius: 100,
            background: 'rgba(68,138,255,0.1)', color: '#448AFF',
          }}>
            Driver found!
          </div>
        ) : post.status === 'active' && post.type === 'direct' && post.expiresAt ? (
          <DirectBookingCountdown driverHandle={post.driverHandle || post.driverName || 'Driver'} expiresAt={post.expiresAt} />
        ) : post.status === 'cancelled' ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '4px 12px', borderRadius: 100,
            background: 'rgba(255,82,82,0.1)', color: '#FF5252',
          }}>
            Cancelled
          </div>
        ) : post.status === 'active' ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '4px 12px', borderRadius: 100,
            background: 'rgba(0,230,118,0.1)', color: '#00E676',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#00E676',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            Looking for drivers...
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Direct booking countdown ──
function DirectBookingCountdown({ driverHandle, expiresAt }: { driverHandle: string; expiresAt: string }) {
  const [countdown, setCountdown] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const tick = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown('Expired');
        setIsUrgent(true);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${mins}:${String(secs).padStart(2, '0')}`);
      setIsUrgent(remaining < 60000);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const isExpired = countdown === 'Expired';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
    }}>
      <div style={{
        fontSize: 11, color: '#888',
      }}>
        {isExpired ? `${driverHandle} didn\u2019t respond` : `${driverHandle} Notified`}
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 100,
        fontFamily: "'Space Mono', monospace",
        background: isExpired ? 'rgba(255,82,82,0.1)' : isUrgent ? 'rgba(255,82,82,0.1)' : 'rgba(0,230,118,0.08)',
        color: isExpired ? '#FF5252' : isUrgent ? '#FF5252' : '#00E676',
        border: `1px solid ${isExpired || isUrgent ? 'rgba(255,82,82,0.2)' : 'rgba(0,230,118,0.2)'}`,
      }}>
        {!isExpired && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isUrgent ? '#FF5252' : '#00E676',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        )}
        {isExpired ? 'Expired' : countdown}
      </div>
    </div>
  );
}

// ── Helpers ──
function StatusDot({ status, expiresAt }: { status: string; expiresAt?: string | null }) {
  // Derive effective status — active direct bookings past expiry are expired
  let effective = status;
  if (status === 'active' && expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    effective = 'expired';
  }
  const color = effective === 'completed' ? '#00E676'
    : effective === 'matched' ? '#448AFF'
    : effective === 'cancelled' || effective === 'expired' ? '#FF5252'
    : '#888';
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
    }} />
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed': return 'Done';
    case 'matched': return 'Matched';
    case 'expired': return 'Expired';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
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
