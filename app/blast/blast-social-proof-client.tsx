'use client';

// Stream A — read-only driver grid + sticky CTA. Matches the look of
// /rider/browse but intentionally strips the per-card HMU button: the only
// action on this surface is "Get a Ride", which routes into the form.
//
// Per docs/BLAST-V3-AGENT-CONTRACT.md §5.1 (mobile-first, header offset),
// §5.5 (frontend feel — no flat buttons, staggered entrance), §6.6 ("/blast"
// rows: card hover MagneticButton, CTA at rest subtle pulse).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import { StaggeredList } from '@/components/blast/motion';
import type { BrowseDriverRow } from '@/lib/hmu/browse-drivers-query';

interface Props {
  initialDrivers: BrowseDriverRow[];
}

const PAGE_SIZE = 24;

export default function BlastSocialProofClient({ initialDrivers }: Props) {
  const prefersReduced = useReducedMotion();
  const [drivers, setDrivers] = useState<BrowseDriverRow[]>(initialDrivers);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(initialDrivers.length === 0);
  const offsetRef = useRef(initialDrivers.length);
  const inFlightRef = useRef(false);

  // PageView event for funnel attribution.
  useEffect(() => {
    try { posthog.capture('blast_landing_viewed', { driverCount: initialDrivers.length }); } catch { /* ignore */ }
  }, [initialDrivers.length]);

  // Infinite scroll using IntersectionObserver-flavored scroll handler. The
  // existing /rider/browse uses useInfiniteList; we're not pulling that in
  // here because /blast is intentionally lighter weight (no auth, no filters).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (done) return;
    const onScroll = () => {
      if (inFlightRef.current) return;
      if (window.innerHeight + window.scrollY < document.body.offsetHeight - 800) return;
      inFlightRef.current = true;
      setLoadingMore(true);
      fetch(`/api/rider/browse/list?offset=${offsetRef.current}&limit=${PAGE_SIZE}`)
        .then((r) => (r.ok ? r.json() : { drivers: [] }))
        .then((data: { drivers?: BrowseDriverRow[] }) => {
          const fresh = data.drivers ?? [];
          if (fresh.length === 0) {
            setDone(true);
          } else {
            setDrivers((d) => [...d, ...fresh]);
            offsetRef.current += fresh.length;
          }
        })
        .catch(() => { /* silent */ })
        .finally(() => {
          setLoadingMore(false);
          inFlightRef.current = false;
        });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [done]);

  const handleCtaClick = useCallback(() => {
    try { posthog.capture('blast_cta_clicked', { source: 'landing' }); } catch { /* ignore */ }
  }, []);

  return (
    <main
      style={{
        paddingTop: 'var(--header-height)',
        minHeight: '100dvh',
        background: '#080808',
        color: '#fff',
        paddingBottom: 120,
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      <header style={{ padding: '20px 16px 12px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 800,
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            letterSpacing: 0.5,
          }}
        >
          Get a Ride
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#aaa', maxWidth: 480 }}>
          Tell us where you&rsquo;re headed. Drivers HMU back. You pick.
        </p>
      </header>

      <section style={{ padding: '4px 12px 0' }}>
        <StaggeredList as="div" staggerMs={60}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 10,
            }}
          >
            {drivers.map((d) => (
              <DriverCard key={d.handle} driver={d} />
            ))}
          </div>
        </StaggeredList>
        {loadingMore && (
          <div style={{ textAlign: 'center', color: '#666', fontSize: 12, padding: '20px 0' }}>
            Loading…
          </div>
        )}
        {done && drivers.length > 0 && (
          <div style={{ textAlign: 'center', color: '#444', fontSize: 12, padding: '20px 0' }}>
            That&rsquo;s everyone for now.
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </section>

      {/* Sticky bottom CTA — pulses unless reduced-motion */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '16px 16px 24px',
          background: 'linear-gradient(to top, #080808 65%, rgba(8,8,8,0))',
          zIndex: 40,
        }}
      >
        <Link
          href="/rider/blast/new"
          onClick={handleCtaClick}
          aria-label="Start a blast"
          style={{ textDecoration: 'none', display: 'block' }}
        >
          <motion.div
            whileTap={prefersReduced ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={prefersReduced ? '' : 'animate-pulse'}
            style={{
              width: '100%',
              padding: '18px 20px',
              borderRadius: 16,
              background: '#00E676',
              color: '#000',
              fontWeight: 800,
              fontSize: 17,
              textAlign: 'center',
              boxShadow: '0 0 32px rgba(0,230,118,0.35)',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Get a Ride
          </motion.div>
        </Link>
        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, color: '#666' }}>
          Free to send. Pay only when a driver matches.
        </p>
      </div>
    </main>
  );
}

// ─── DriverCard — read-only ────────────────────────────────────────────────
function DriverCard({ driver }: { driver: BrowseDriverRow }) {
  const heroSrc = driver.photoUrl;
  return (
    <article
      style={{
        background: '#141414',
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          aspectRatio: '4 / 5',
          background: '#0a0a0a',
          position: 'relative',
        }}
      >
        {driver.videoUrl ? (
          <video
            src={driver.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : heroSrc ? (
          <img
            src={heroSrc}
            alt={driver.displayName || driver.handle}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 48,
              color: '#444',
              background: 'radial-gradient(circle at 50% 40%, #1a1a1a, #0a0a0a)',
            }}
          >
            {(driver.displayName || driver.handle || '?').charAt(0).toUpperCase()}
          </div>
        )}
        {driver.isHmuFirst && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              fontSize: 10,
              fontWeight: 800,
              color: '#000',
              background: '#FFD600',
              padding: '3px 8px',
              borderRadius: 100,
              letterSpacing: 0.4,
            }}
          >
            FIRST
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {driver.displayName || `@${driver.handle}`}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          {Number.isFinite(driver.chillScore) && driver.chillScore > 0 && (
            <span style={{ color: '#00E676', fontWeight: 600 }}>
              {Math.round(driver.chillScore)}% chill
            </span>
          )}
          {driver.minPrice > 0 && (
            <>
              <span style={{ color: '#444', margin: '0 6px' }}>·</span>
              <span>from ${driver.minPrice}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
