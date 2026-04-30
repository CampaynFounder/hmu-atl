'use client';

// Masked list of riders who have viewed this driver's profile.
// Tapping "Send HMU" hits POST /api/driver/hmu (existing endpoint) which
// is rate-limited and idempotent. UI mirrors the masked-card aesthetic
// from /rider/browse so masking remains a system-wide convention.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fbCustomEvent } from '@/components/analytics/meta-pixel';

interface Viewer {
  rider_id: string;
  view_count: number;
  last_viewed_at: string;
  first_viewed_at: string;
  rider_handle: string | null;
  rider_display_name: string | null;
  rider_thumbnail_url: string | null;
  rider_gender: string | null;
  hmu_status: 'active' | 'linked' | 'dismissed' | 'expired' | 'unlinked' | null;
  is_blocked_by_rider: boolean;
}

interface Stats {
  unique_riders: number;
  total_views: number;
  unique_riders_today: number;
  unique_riders_7d: number;
}

export function ViewersClient() {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/driver/profile-views', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setViewers(((data.viewers ?? []) as Viewer[]).filter(v => !v.is_blocked_by_rider));
            setStats(data.stats ?? null);
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSendHmu = useCallback(async (riderId: string) => {
    setSendingFor(riderId);
    setErrorFor(null);
    try {
      const res = await fetch('/api/driver/hmu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorFor({
          id: riderId,
          msg: res.status === 429 ? 'Daily HMU cap hit. Reset at midnight.' : (data.error || 'Could not send'),
        });
        return;
      }
      fbCustomEvent('FunnelLead_driver_send_hmu', { funnel_stage: 'driver_send_hmu', audience: 'driver' });
      // Optimistic flip — local only; server has the true state on next refresh.
      setViewers(prev =>
        prev.map(v => v.rider_id === riderId ? { ...v, hmu_status: 'active' } : v),
      );
    } catch {
      setErrorFor({ id: riderId, msg: 'Network error' });
    } finally {
      setSendingFor(null);
    }
  }, []);

  return (
    <div style={{
      minHeight: '100svh', background: '#080808', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      padding: '60px 16px 40px',
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 28, margin: 0,
          }}>
            WHO&apos;S CHECKED YOU OUT
          </h1>
          <Link href="/driver/home" style={{ fontSize: 13, color: '#00E676', textDecoration: 'none', fontWeight: 700 }}>
            Back
          </Link>
        </div>

        {/* Stats strip */}
        {stats && stats.total_views > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            marginBottom: 18,
          }}>
            <StatPill label="Today" value={stats.unique_riders_today} />
            <StatPill label="7-day" value={stats.unique_riders_7d} />
            <StatPill label="Total" value={stats.unique_riders} />
          </div>
        )}

        {/* Conversion tip — only when there ARE viewers but no link/HMU yet */}
        {viewers.length > 0 && viewers.every(v => v.hmu_status !== 'linked') && (
          <ConversionTips />
        )}

        {loading ? (
          <Loading />
        ) : viewers.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {viewers.map((v) => (
              <ViewerRow
                key={v.rider_id}
                v={v}
                sending={sendingFor === v.rider_id}
                error={errorFor?.id === v.rider_id ? errorFor.msg : null}
                onSend={() => handleSendHmu(v.rider_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: '10px 12px', textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 22, color: '#fff', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function ConversionTips() {
  return (
    <div style={{
      background: 'rgba(0,230,118,0.06)',
      border: '1px solid rgba(0,230,118,0.18)',
      borderRadius: 12, padding: '12px 14px', marginBottom: 14,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#00E676', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
        💡 Convert more views
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        <li>Add a 5-second video intro — biggest single conversion lift.</li>
        <li>Lower your minimum by $2–3 to widen your match window.</li>
        <li>Keep your live areas tight — 2–3 areas convert better than 6+.</li>
      </ul>
    </div>
  );
}

function ViewerRow({
  v, sending, error, onSend,
}: {
  v: Viewer;
  sending: boolean;
  error: string | null;
  onSend: () => void;
}) {
  const initial = (v.rider_display_name || v.rider_handle || '?').charAt(0).toUpperCase();
  const isLinked = v.hmu_status === 'linked';
  const isActive = v.hmu_status === 'active';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 14,
      background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Masked avatar */}
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: '#1f1f1f',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        position: 'relative', overflow: 'hidden',
      }}>
        {v.rider_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={v.rider_thumbnail_url}
            alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              filter: isLinked ? 'none' : 'blur(8px)',
              transform: isLinked ? 'none' : 'scale(1.2)',
            }}
          />
        ) : (
          <span style={{ fontSize: 18, color: '#aaa', fontWeight: 700 }}>{initial}</span>
        )}
      </div>

      {/* Identity */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
          {isLinked
            ? (v.rider_display_name || v.rider_handle || `Rider ${initial}`)
            : `${initial}.`}
          {' '}
          {v.view_count > 1 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#00E676', marginLeft: 4 }}>
              ×{v.view_count}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          Last viewed {timeAgo(v.last_viewed_at)}
        </div>
        {error && (
          <div style={{ fontSize: 11, color: '#FF5252', marginTop: 2 }}>
            {error}
          </div>
        )}
      </div>

      {/* Action */}
      {isLinked ? (
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#00E676',
          padding: '6px 10px', borderRadius: 100,
          background: 'rgba(0,230,118,0.12)', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          ✓ Linked
        </span>
      ) : isActive ? (
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#aaa',
          padding: '6px 10px', borderRadius: 100,
          background: 'rgba(255,255,255,0.06)', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          HMU sent
        </span>
      ) : (
        <button
          onClick={onSend}
          disabled={sending}
          style={{
            fontSize: 12, fontWeight: 800,
            padding: '8px 14px', borderRadius: 100, border: 'none',
            background: sending ? 'rgba(0,230,118,0.4)' : '#00E676',
            color: '#080808', cursor: sending ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {sending ? 'Sending…' : 'Send HMU'}
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#666', fontSize: 13 }}>
      Loading…
    </div>
  );
}

function Empty() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>👀</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No views yet</div>
      <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
        Riders who open your profile show up here. Share your handle to get more eyes.
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
