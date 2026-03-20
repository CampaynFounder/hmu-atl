'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAbly } from '@/hooks/use-ably';

interface Props {
  displayName: string;
  userId: string;
}

interface PostedRequest {
  id: string;
  message: string;
  price: number;
  status: string;
  createdAt: string;
}

interface MatchNotification {
  rideId: string;
  driverName?: string;
  price?: number;
  message?: string;
}

export default function RiderFeedClient({ displayName, userId }: Props) {
  const [input, setInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [posts, setPosts] = useState<PostedRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [matchNotif, setMatchNotif] = useState<MatchNotification | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ably subscription for real-time notifications
  const handleAblyMessage = useCallback((msg: { name: string; data: unknown }) => {
    const data = msg.data as Record<string, unknown>;
    if (msg.name === 'booking_accepted' || msg.name === 'ride_update') {
      const rideId = data.rideId as string;
      if (rideId) {
        setMatchNotif({
          rideId,
          driverName: data.driverName as string,
          price: data.price as number,
          message: (data.message as string) || 'A driver accepted your ride!',
        });
        // Update post status
        if (data.postId) {
          setPosts(prev => prev.map(p => p.id === data.postId ? { ...p, status: 'matched' } : p));
        }
        // Auto-redirect after 3 seconds
        setTimeout(() => {
          window.location.href = `/ride/${rideId}`;
        }, 3000);
      }
    }
  }, []);

  useAbly({
    channelName: userId ? `user:${userId}:notify` : null,
    onMessage: handleAblyMessage,
  });

  // Check for active ride on mount
  useEffect(() => {
    fetch('/api/rides/active')
      .then(r => r.json())
      .then(data => {
        if (data.hasActiveRide) {
          window.location.href = `/ride/${data.rideId}`;
        }
      })
      .catch(() => {});
  }, []);

  // Load existing posts
  useEffect(() => {
    fetch('/api/rider/posts')
      .then(r => r.json())
      .then(data => {
        if (data.posts) setPosts(data.posts);
      })
      .catch(() => {});
  }, []);

  async function handleDelete(postId: string) {
    try {
      const res = await fetch(`/api/rider/posts?postId=${postId}`, { method: 'DELETE' });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
      }
    } catch { /* silent */ }
  }

  async function handlePost() {
    const text = input.trim();
    if (!text) return;

    // Parse the message for price and destination
    const priceMatch = text.match(/\$(\d+)/);
    const price = priceMatch ? parseInt(priceMatch[1]) : 0;

    if (price < 10) {
      setError('Include a price of at least $10 (e.g. "midtown > airport $25")');
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/rider/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, price }),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts(prev => [{ id: data.postId, message: text, price, status: 'active', createdAt: new Date().toISOString() }, ...prev]);
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
        .rf-examples { display: flex; gap: 6px; overflow-x: auto; padding: 10px 0 0; -webkit-overflow-scrolling: touch; }
        .rf-examples::-webkit-scrollbar { display: none; }
        .rf-example { background: var(--card2); border: 1px solid var(--border); border-radius: 100px; padding: 8px 14px; font-size: 12px; color: var(--gray-light); white-space: nowrap; cursor: pointer; flex-shrink: 0; transition: all 0.15s; }
        .rf-example:hover { border-color: rgba(0,230,118,0.3); color: var(--green); }
        .rf-error { font-size: 13px; color: #FF5252; margin-top: 8px; padding: 0 4px; }

        .rf-section-title { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; padding: 20px 20px 10px; }

        .rf-post { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; margin: 0 20px 12px; }
        .rf-post-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .rf-post-name { font-weight: 700; font-size: 15px; }
        .rf-post-time { font-size: 12px; color: var(--gray); }
        .rf-post-message { font-size: 17px; line-height: 1.4; margin-bottom: 12px; }
        .rf-post-price { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; color: var(--green); line-height: 1; margin-bottom: 8px; }
        .rf-post-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 12px; border-radius: 100px; }
        .rf-post-status--active { background: rgba(0,230,118,0.1); color: var(--green); }
        .rf-post-status--matched { background: rgba(68,138,255,0.1); color: #448AFF; }
        .rf-post-status--expired { background: rgba(255,255,255,0.05); color: var(--gray); }
        .rf-post-dot { width: 6px; height: 6px; border-radius: 50%; animation: pulse 1.5s ease-in-out infinite; }
        .rf-post-dot--active { background: var(--green); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .rf-empty { text-align: center; padding: 40px 20px; }
        .rf-empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.4; }
        .rf-empty-text { font-size: 15px; color: var(--gray); line-height: 1.5; max-width: 280px; margin: 0 auto; }

        .rf-tip { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 16px 20px; margin: 0 20px 12px; }
        .rf-tip-title { font-size: 13px; font-weight: 700; color: var(--green); margin-bottom: 4px; }
        .rf-tip-text { font-size: 12px; color: var(--gray); line-height: 1.5; }
      `}</style>

      <div className="rf">
        <div className="rf-header">
          <h1 className="rf-greeting">Where you headed, @{displayName}?</h1>
          <p className="rf-sub">Post what you need. Drivers online now sayin HMU.</p>
        </div>

        {/* Composer */}
        <div className="rf-composer">
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
            <button
              className="rf-send"
              onClick={handlePost}
              disabled={posting || !input.trim()}
            >
              {posting ? '...' : '\u2191'}
            </button>
          </div>

          <div className="rf-examples">
            {[
              'midtown > airport $30',
              'who downtown? $15',
              'decatur > buckhead $20',
              'bankhead > gresham 2 stops $35',
              'marietta > airport $40 round trip',
            ].map((ex) => (
              <button key={ex} className="rf-example" onClick={() => {
                setInput(ex);
                // Focus and select so typing replaces
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                  }
                }, 50);
              }}>
                {ex}
              </button>
            ))}
          </div>

          {error && <div className="rf-error">{error}</div>}
        </div>

        {/* How it works tip */}
        {posts.length === 0 && (
          <div className="rf-tip">
            <div className="rf-tip-title">How it works</div>
            <div className="rf-tip-text">
              Post where you&apos;re going and your price. Drivers in the area see your request and tap HMU to offer you a ride. You pick the driver you want.
            </div>
          </div>
        )}

        {/* Posts */}
        {posts.length > 0 && (
          <div className="rf-section-title">Your Requests</div>
        )}

        {posts.map((post) => (
          <div key={post.id} className="rf-post">
            <div className="rf-post-header">
              <span className="rf-post-name">@{displayName}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="rf-post-time">{getTimeAgo(post.createdAt)}</span>
                {post.status === 'active' && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    style={{
                      background: 'none', border: 'none', color: '#FF5252',
                      fontSize: '12px', cursor: 'pointer', padding: '2px 6px',
                      fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <div className="rf-post-message">{post.message}</div>
            <div className="rf-post-price">${post.price}</div>
            <span className={`rf-post-status rf-post-status--${post.status}`}>
              {post.status === 'active' && <span className="rf-post-dot rf-post-dot--active" />}
              {post.status === 'active' ? 'Looking for drivers...' : post.status === 'matched' ? 'Driver found!' : 'Expired'}
            </span>
          </div>
        ))}

        {posts.length === 0 && (
          <div className="rf-empty">
            <div className="rf-empty-icon">{'\uD83D\uDE97'}</div>
            <div className="rf-empty-text">
              Post your first ride request above. Type where you&apos;re going and include a price.
            </div>
          </div>
        )}

        {/* Browse drivers link */}
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <Link
            href="/rider/browse"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: '100px',
              border: '1px solid rgba(0,230,118,0.2)',
              color: '#00E676',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
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

          <div style={{ animation: 'matchBounce 0.5s ease-out', marginBottom: '20px' }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              background: 'rgba(0,230,118,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: '70px', height: '70px', borderRadius: '50%',
                background: '#00E676', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '32px',
              }}>
                {'\uD83D\uDE97'}
              </div>
            </div>
          </div>

          <h2 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: '36px', color: '#fff', textAlign: 'center', marginBottom: '8px',
            animation: 'matchPulse 2s ease-in-out infinite',
          }}>
            DRIVER FOUND!
          </h2>

          <p style={{ fontSize: '16px', color: '#00E676', fontWeight: 600, marginBottom: '4px' }}>
            {matchNotif.message}
          </p>

          {matchNotif.price && (
            <p style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: '48px', color: '#00E676', margin: '12px 0',
            }}>
              ${matchNotif.price}
            </p>
          )}

          <p style={{ fontSize: '14px', color: '#888', marginTop: '16px' }}>
            Loading your ride...
          </p>

          <div style={{
            width: '40px', height: '40px', border: '3px solid rgba(0,230,118,0.3)',
            borderTopColor: '#00E676', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', marginTop: '12px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
