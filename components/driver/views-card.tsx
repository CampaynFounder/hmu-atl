'use client';

// Compact "X riders viewed your profile" card for /driver/home.
// Click → /driver/viewers (the masked list with Send HMU CTAs).
// Stats are fetched once on mount, no polling — counter updates on
// next visit, which is honest and avoids the jumpy-realtime feel.

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  unique_riders: number;
  total_views: number;
  unique_riders_today: number;
  unique_riders_7d: number;
}

export function ViewsCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/driver/profile-views?stats=1', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setStats(data.stats ?? null);
        }
      } catch { /* swallow — empty card */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Hide entirely while loading and when there are zero views.
  // No views = no value in showing a sad zero state.
  if (loading) return null;
  if (!stats || stats.total_views === 0) return null;

  const today = stats.unique_riders_today;
  const week = stats.unique_riders_7d;

  return (
    <Link
      href="/driver/viewers"
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
        marginBottom: 16,
      }}
    >
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,230,118,0.10), rgba(0,230,118,0.04))',
        border: '1px solid rgba(0,230,118,0.22)',
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        cursor: 'pointer',
      }}>
        <div>
          <div style={{
            fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
            color: '#00E676', fontWeight: 700, marginBottom: 4,
          }}>
            Profile views
          </div>
          <div style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 26, color: '#fff', lineHeight: 1,
          }}>
            {today > 0 ? `${today} today` : `${week} this week`}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Tap to see who and reach out →
          </div>
        </div>
        <div style={{ fontSize: 28 }}>👀</div>
      </div>
    </Link>
  );
}
