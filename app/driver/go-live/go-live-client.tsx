'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import DealPill from '@/components/driver/deal-pill';

interface Props {
  displayName: string;
  handle: string;
  areas: string[];
}

interface ActivePost {
  id: string;
  message: string;
  price: number;
  areas: string[];
  status: string;
  createdAt: string;
  expiresAt: string;
}

export default function GoLiveClient({ displayName, handle, areas }: Props) {
  const [input, setInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [posts, setPosts] = useState<ActivePost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing posts
  useEffect(() => {
    fetch('/api/driver/posts')
      .then(r => r.json())
      .then(data => { if (data.posts) setPosts(data.posts); })
      .catch(() => {});
  }, []);

  async function handlePost() {
    const text = input.trim();
    if (!text) return;

    setPosting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/driver/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts(prev => [{
          id: data.postId, message: text, price: 0,
          areas, status: 'active',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        }, ...prev.map(p => ({ ...p, status: p.status === 'active' ? 'expired' : p.status }))]);
        setInput('');
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to post');
      }
    } catch {
      setError('Network error');
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(postId: string) {
    try {
      const res = await fetch(`/api/driver/posts?postId=${postId}`, { method: 'DELETE' });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
      }
    } catch { /* silent */ }
  }

  const activePost = posts.find(p => p.status === 'active');

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .gl { background: var(--black); min-height: 100svh; color: #fff; font-family: var(--font-body, 'DM Sans', sans-serif); padding: 72px 20px 40px; }
        .gl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .gl-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; margin: 0; }
        .gl-back { font-size: 14px; color: var(--green); text-decoration: none; font-weight: 600; }

        .gl-card { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; margin-bottom: 16px; }
        .gl-input-wrap { display: flex; gap: 10px; align-items: center; }
        .gl-input { flex: 1; background: var(--card2); border: 1px solid var(--border); border-radius: 100px; padding: 16px 20px; color: #fff; font-size: 16px; outline: none; font-family: var(--font-body, 'DM Sans', sans-serif); transition: border-color 0.2s; }
        .gl-input:focus { border-color: var(--green); }
        .gl-input::placeholder { color: #555; }
        .gl-send { width: 50px; height: 50px; border-radius: 50%; border: none; background: var(--green); color: var(--black); font-size: 20px; font-weight: 700; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .gl-send:hover { transform: scale(1.05); }
        .gl-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

        .gl-error { font-size: 13px; color: #FF5252; margin-top: 8px; }
        .gl-success { font-size: 13px; color: var(--green); margin-top: 8px; font-weight: 600; }

        .gl-live-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.2); border-radius: 100px; padding: 6px 14px; font-size: 13px; color: var(--green); font-weight: 600; }
        .gl-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: glPulse 1.5s ease-in-out infinite; }
        @keyframes glPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        .gl-post { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; margin-bottom: 12px; }
        .gl-post-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .gl-post-name { font-weight: 700; font-size: 15px; }
        .gl-post-message { font-size: 17px; line-height: 1.4; margin-bottom: 12px; }
        .gl-post-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .gl-post-time { font-size: 12px; color: var(--gray); }
        .gl-post-areas { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .gl-post-area { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 4px 10px; font-size: 11px; color: var(--gray-light); }

        .gl-cancel-btn { background: none; border: none; color: #FF5252; font-size: 12px; cursor: pointer; padding: 2px 6px; font-family: var(--font-body, 'DM Sans', sans-serif); }

        .gl-tip { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 16px 20px; margin-bottom: 16px; }
        .gl-tip-title { font-size: 13px; font-weight: 700; color: var(--green); margin-bottom: 4px; }
        .gl-tip-text { font-size: 12px; color: var(--gray); line-height: 1.5; }

        .gl-section-title { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; margin-top: 20px; }
      `}</style>

      <div className="gl">
        <DealPill />
        <div className="gl-header">
          <h1 className="gl-title">Go Live</h1>
          <Link href="/driver/home" className="gl-back">Home</Link>
        </div>

        {/* Active status */}
        {activePost && (
          <div className="gl-card" style={{ borderColor: 'rgba(0,230,118,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div className="gl-live-badge">
                <span className="gl-live-dot" />
                You&apos;re Live
              </div>
              <button className="gl-cancel-btn" onClick={() => handleDelete(activePost.id)}>
                Go Offline
              </button>
            </div>
            <div className="gl-post-message">{activePost.message}</div>
            <div className="gl-post-meta">
              <span className="gl-post-time">
                Expires {new Date(activePost.expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            {activePost.areas.length > 0 && (
              <div className="gl-post-areas">
                {activePost.areas.map(a => <span key={a} className="gl-post-area">{a}</span>)}
              </div>
            )}
          </div>
        )}

        {/* Composer */}
        <div className="gl-card">
          <div style={{ fontSize: '14px', color: '#bbb', marginBottom: '12px' }}>
            Tell riders what you&apos;re offering, @{handle}
          </div>
          <div className="gl-input-wrap">
            <input
              ref={inputRef}
              className="gl-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePost()}
              placeholder='e.g. "Doin Rides All Day $20 HMU"'
              disabled={posting}
            />
            <button
              className="gl-send"
              onClick={handlePost}
              disabled={posting || !input.trim()}
            >
              {posting ? '...' : '\u2191'}
            </button>
          </div>
          {error && <div className="gl-error">{error}</div>}
          {success && <div className="gl-success">You&apos;re live! Riders can see you now.</div>}
        </div>

        {/* Tips */}
        {!activePost && posts.length === 0 && (
          <div className="gl-tip">
            <div className="gl-tip-title">How it works</div>
            <div className="gl-tip-text">
              Post what you&apos;re offering in your own words. Riders browsing for drivers will see your availability card with your message, profile, and areas. When they book, you get a notification.
            </div>
          </div>
        )}

        {/* Past posts */}
        {posts.filter(p => p.status !== 'active').length > 0 && (
          <>
            <div className="gl-section-title">Past Posts</div>
            {posts.filter(p => p.status !== 'active').map(post => (
              <div key={post.id} className="gl-post" style={{ opacity: 0.6 }}>
                <div className="gl-post-header">
                  <span className="gl-post-name">@{handle}</span>
                  <span className="gl-post-time">{getTimeAgo(post.createdAt)}</span>
                </div>
                <div className="gl-post-message">{post.message}</div>
                <span style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '100px',
                  background: 'rgba(255,255,255,0.05)', color: '#888', fontWeight: 600,
                }}>
                  {post.status === 'expired' ? 'EXPIRED' : post.status.toUpperCase()}
                </span>
              </div>
            ))}
          </>
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
