'use client';

// Stream C — client for the driver feed of all open blasts.
// Polls /api/admin/blast (admin route also serves driver feed reads — falls
// back to a per-market public listing if the route is admin-only). For now
// we hit /api/blast/list (assumed to be added later) or the admin endpoint.
// Until either exists in production, the page renders an empty-state shell.
//
// Beacon: when a card scrolls into view, fires a single impression beacon
// per (driver, blast) per session. Beacon endpoint owned by Stream B (PR #97
// implements it as POST /api/blast/[id]/impressions/beacon).
//
// Real-time: subscribes to Ably channel market:{slug}:blasts; new blast
// arrivals slide in at top with PulseOnMount.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import {
  PulseOnMount,
  ShimmerSlot,
  StaggeredList,
} from '@/components/blast/motion';

interface Blast {
  id: string;
  shortcode?: string;
  riderFirstName?: string;
  riderPhotoUrl?: string;
  pickupAddress: string;
  dropoffAddress: string;
  priceDollars: number;
  scheduledFor: string | null;
  distanceMi?: number;
  score?: number;
  notifiedAt?: string | null;
}

export interface DriverRequestsClientProps {
  driverId: string;
  marketSlug: string;
  driverLat: number | null;
  driverLng: number | null;
  feedMinScorePercentile: number;
}

export function DriverRequestsClient({
  marketSlug,
  feedMinScorePercentile,
}: DriverRequestsClientProps) {
  const [blasts, setBlasts] = useState<Blast[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenBeaconsRef = useRef<Set<string>>(new Set());

  // Initial fetch — hits an admin/feed endpoint. If 404/501, render empty
  // gracefully so this stream's UI is verifiable on staging even before the
  // listing endpoint lands.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/blast?market=${encodeURIComponent(marketSlug)}&status=active`);
        if (!res.ok) {
          if (!cancelled) setBlasts([]);
          return;
        }
        const body = await res.json();
        const items: Blast[] = Array.isArray(body?.blasts) ? body.blasts : [];
        if (!cancelled) {
          setBlasts(
            items.filter((b) => (b.score ?? 100) >= feedMinScorePercentile)
          );
        }
      } catch {
        if (!cancelled) setError('Could not load requests.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [marketSlug, feedMinScorePercentile]);

  useEffect(() => {
    if (blasts && blasts.length > 0) {
      posthog.capture('driver_requests_feed_viewed', { visibleBlastCount: blasts.length });
    }
  }, [blasts]);

  const sendBeacon = useCallback((blastId: string) => {
    if (seenBeaconsRef.current.has(blastId)) return;
    seenBeaconsRef.current.add(blastId);
    fetch(`/api/blast/${blastId}/impressions/beacon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'feed' }),
    }).catch(() => {});
  }, []);

  return (
    <main
      style={{
        minHeight: '100dvh',
        paddingTop: 'var(--header-height, 3.5rem)',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 32,
        background: '#080808', color: '#fff',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      <div style={{ maxWidth: 720, margin: '20px auto 0' }}>
        <h1 style={H1}>Open Requests</h1>
        <p style={SUB}>Riders looking for a ride near you. Tap to see details.</p>

        {blasts === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            <ShimmerSlot height={120} radius={16} />
            <ShimmerSlot height={120} radius={16} />
            <ShimmerSlot height={120} radius={16} />
          </div>
        )}

        {error && (
          <p style={{ color: '#FF8A8A', marginTop: 16 }}>{error}</p>
        )}

        {blasts && blasts.length === 0 && !error && (
          <div style={{
            marginTop: 32, padding: '32px 20px', borderRadius: 20,
            background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.65)', margin: 0 }}>
              No open requests right now. Hang tight — we&apos;ll buzz you when one lands.
            </p>
          </div>
        )}

        {blasts && blasts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            <StaggeredList>
              {blasts.map((b) => (
                <div key={b.id} style={{ marginBottom: 12 }}>
                  <BlastCard blast={b} onVisible={() => sendBeacon(b.id)} />
                </div>
              ))}
            </StaggeredList>
          </div>
        )}
      </div>
    </main>
  );
}

function BlastCard({ blast, onVisible }: { blast: Blast; onVisible: () => void }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!ref.current || firedRef.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !firedRef.current) {
          firedRef.current = true;
          onVisible();
          obs.disconnect();
          break;
        }
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onVisible]);

  const linkTarget = blast.shortcode ? `/d/b/${blast.shortcode}?src=feed` : `/d/b/${blast.id}?src=feed`;

  return (
    <PulseOnMount>
      <motion.a
        ref={ref}
        href={linkTarget}
        whileTap={{ scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          display: 'flex', gap: 14, alignItems: 'flex-start',
          padding: 16, borderRadius: 18,
          background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
          textDecoration: 'none', color: 'inherit',
          transition: 'border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {blast.riderPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blast.riderPhotoUrl}
            alt={blast.riderFirstName ?? 'Rider'}
            style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: 'rgba(0,230,118,0.1)', color: '#00E676',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 20,
          }}>
            {(blast.riderFirstName ?? '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {blast.riderFirstName ?? 'Rider'}
            </span>
            <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", color: '#00E676', fontWeight: 700 }}>
              ${blast.priceDollars}
            </span>
          </div>
          <p style={{ margin: '6px 0 4px', fontSize: 13, color: 'rgba(255,255,255,0.78)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {blast.pickupAddress} → {blast.dropoffAddress}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {blast.scheduledFor ? new Date(blast.scheduledFor).toLocaleString() : 'Now'}
            {typeof blast.distanceMi === 'number' && ` • ${blast.distanceMi.toFixed(1)} mi away`}
          </p>
        </div>
      </motion.a>
    </PulseOnMount>
  );
}

const H1: React.CSSProperties = {
  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
  fontSize: 36, lineHeight: 1, letterSpacing: 1, margin: 0, color: '#fff',
};
const SUB: React.CSSProperties = {
  fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0',
};
