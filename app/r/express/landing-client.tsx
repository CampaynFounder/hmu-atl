'use client';

// Unauthed landing for /r/express. Single CTA → /sign-up with returnTo back
// to /r/express, where the onboarding host takes over post-auth.
// Conversion-optimised: one above-the-fold value prop, three trust pillars,
// rotating "live drivers" strip with synthetic blurred avatars (same pool as
// /driver/express → /public/express-avatars/).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';

const PILLARS = [
  { icon: '💸', title: 'Real local prices',    body: 'Fair Pay None of that 🧢 surge' },
  { icon: '🛡️', title: 'Payment held safely', body: 'Driver Paid Only After Ride Begins' },
  { icon: '📍', title: 'Tracked end-to-end',   body: 'Every ride GPS-recorded.' },
];

interface MockDriver {
  handle: string;
  name: string;
  area: string;
  price: string;
}

const POOL: MockDriver[] = [
  { handle: 'tay-d',    name: 'Tay D.',     area: 'Eastside',         price: '$15+' },
  { handle: 'marcus-j', name: 'Marcus J.',  area: 'Buckhead',         price: '$18+' },
  { handle: 'aaliyah',  name: 'Aaliyah K.', area: 'Decatur',          price: '$12+' },
  { handle: 'd-ray',    name: 'D-Ray',      area: 'College Park',     price: '$14+' },
  { handle: 'kris',     name: 'Kris L.',    area: 'Midtown',          price: '$16+' },
  { handle: 'jay-w',    name: 'Jay W.',     area: 'East Atlanta',     price: '$13+' },
  { handle: 'mecca',    name: 'Mecca B.',   area: 'West End',         price: '$15+' },
  { handle: 'ant',      name: 'Ant',        area: 'Smyrna',           price: '$17+' },
  { handle: 'shay-r',   name: 'Shay R.',    area: 'Old Fourth Ward',  price: '$14+' },
  { handle: 'devon',    name: 'Devon T.',   area: 'Sandy Springs',    price: '$20+' },
  { handle: 'rell',     name: 'Rell',       area: 'Edgewood',         price: '$13+' },
  { handle: 'mali-c',   name: 'Mali C.',    area: 'Vinings',          price: '$16+' },
  { handle: 'jor',      name: 'Jor',        area: 'Atlantic Station', price: '$15+' },
  { handle: 'kj-l',     name: 'KJ',         area: 'Inman Park',       price: '$18+' },
  { handle: 'dre-m',    name: 'Dre M.',     area: 'Cabbagetown',      price: '$12+' },
  { handle: 'q-w',      name: 'Q.',         area: 'Kirkwood',         price: '$16+' },
];

const VISIBLE = 6;
const ROTATION_MIN_MS = 4_000;
const ROTATION_MAX_MS = 9_000;
const FRESH_HIGHLIGHT_MS = 2_500;
const AVATAR_COUNT = 24;

// FNV-ish stable hash → avatar index. Same handle → same blurred face every render.
function avatarUrlFor(handle: string): string {
  let h = 2166136261;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (Math.abs(h) % AVATAR_COUNT) + 1;
  return `/express-avatars/${idx.toString().padStart(2, '0')}.jpg`;
}

function nextRotationDelay(): number {
  return ROTATION_MIN_MS + Math.random() * (ROTATION_MAX_MS - ROTATION_MIN_MS);
}

// Time-seeded shuffle so visitors landing in the same minute see the same
// initial order — but a return visit in a new minute gets a fresh deck.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed | 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) | 0;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function LandingClient() {
  const router = useRouter();

  useEffect(() => {
    fbEvent('ViewContent', { content_name: 'rider_ad_funnel_landing', content_category: 'rider_funnel' });
    fbCustomEvent('FunnelLead_landing', { funnel_stage: 'landing', audience: 'rider_ad_funnel' });
  }, []);

  const seed = useMemo(() => Math.floor(Date.now() / 60_000), []);
  const ordered = useMemo(() => seededShuffle(POOL, seed), [seed]);

  const [visible, setVisible] = useState<MockDriver[]>(() => ordered.slice(0, VISIBLE));
  const [freshHandle, setFreshHandle] = useState<string | null>(null);
  const rotationTimer = useRef<number | null>(null);
  const freshTimer = useRef<number | null>(null);

  // Rotation: every 4–9s, drop one visible card, slot a fresh one in. The
  // new card flashes a "JUST LIVE" highlight for ~2.5s. Variable cadence
  // keeps the eye from locking onto a beat.
  useEffect(() => {
    function schedule() {
      rotationTimer.current = window.setTimeout(() => {
        setVisible(prev => {
          const offdeck = ordered.filter(d => !prev.some(p => p.handle === d.handle));
          if (offdeck.length === 0) return prev;
          const incoming = offdeck[Math.floor(Math.random() * offdeck.length)];
          const dropIdx = Math.floor(Math.random() * prev.length);
          const next = prev.slice();
          next[dropIdx] = incoming;
          setFreshHandle(incoming.handle);
          if (freshTimer.current) window.clearTimeout(freshTimer.current);
          freshTimer.current = window.setTimeout(() => setFreshHandle(null), FRESH_HIGHLIGHT_MS);
          return next;
        });
        schedule();
      }, nextRotationDelay());
    }
    schedule();
    return () => {
      if (rotationTimer.current) window.clearTimeout(rotationTimer.current);
      if (freshTimer.current) window.clearTimeout(freshTimer.current);
    };
  }, [ordered]);

  function handleStart() {
    fbCustomEvent('FunnelLead_cta', { funnel_stage: 'landing_cta', audience: 'rider_ad_funnel' });
    const params = new URLSearchParams({ type: 'rider', returnTo: '/r/express' });
    router.push(`/sign-up?${params.toString()}`);
  }

  return (
    <div style={{
      minHeight: '100svh', background: '#080808',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 20px 40px',
    }}>
      <div style={{ maxWidth: 380, width: '100%' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{
            display: 'inline-block', fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 22, color: '#00E676', letterSpacing: 2,
          }}>
            HMU ATL
          </span>
        </div>

        {/* Hero */}
        <h1 style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 42, color: '#fff', lineHeight: 1, textAlign: 'center', marginBottom: 12,
        }}>
          REAL ATLANTA<br />DRIVERS.<br />FAIR PRICES.
        </h1>
        <p style={{
          fontSize: 15, color: '#aaa', lineHeight: 1.5, textAlign: 'center', marginBottom: 24,
        }}>
          Skip The Surge. Pick Your Driver. Pay Only When The Ride Begins.
        </p>

        {/* Trust pillars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {PILLARS.map((p) => (
            <div key={p.title} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px', borderRadius: 12,
              background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>{p.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{p.title}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{p.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Live drivers strip */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginBottom: 8,
        }}>
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: '#00E676', boxShadow: '0 0 0 0 rgba(0,230,118,0.6)',
            animation: 'rider-live-pulse 1.6s ease-out infinite',
          }} />
          <span style={{
            fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1,
            fontWeight: 700,
          }}>
            Drivers live right now
          </span>
        </div>
        <div style={{
          display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto',
          paddingBottom: 4, scrollbarWidth: 'none' as const,
        }}>
          {visible.map((d, i) => (
            <DriverCard
              key={d.handle}
              driver={d}
              fresh={freshHandle === d.handle}
              mountDelayMs={i * 70}
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          style={{
            width: '100%', padding: 18, borderRadius: 100, border: 'none',
            background: '#00E676', color: '#080808', fontSize: 17, fontWeight: 800,
            cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          Stop Overpaying Uber.
        </button>

        <p style={{
          fontSize: 11, color: '#555', textAlign: 'center', marginTop: 14,
          lineHeight: 1.5,
        }}>
          Free to sign up. Card linked when you book your first ride.
        </p>
      </div>

      {/* Animations live with the component so they don't leak globally. */}
      <style jsx global>{`
        @keyframes rider-live-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(0,230,118,0.55); }
          70%  { box-shadow: 0 0 0 10px rgba(0,230,118,0); }
          100% { box-shadow: 0 0 0 0   rgba(0,230,118,0); }
        }
        @keyframes rider-card-in {
          0%   { opacity: 0; transform: translateY(8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes rider-fresh-flash {
          0%   { box-shadow: 0 0 0 0 rgba(0,230,118,0.7); border-color: #00E676; }
          100% { box-shadow: 0 0 0 14px rgba(0,230,118,0); border-color: rgba(0,230,118,0.18); }
        }
      `}</style>
    </div>
  );
}

function DriverCard({
  driver, fresh, mountDelayMs,
}: { driver: MockDriver; fresh: boolean; mountDelayMs: number }) {
  return (
    <div
      style={{
        flexShrink: 0, padding: '10px 12px', borderRadius: 12,
        background: '#141414',
        border: `1px solid ${fresh ? '#00E676' : 'rgba(0,230,118,0.18)'}`,
        minWidth: 152, position: 'relative' as const,
        animation: fresh
          ? `rider-card-in 360ms cubic-bezier(.2,.8,.2,1) both, rider-fresh-flash ${FRESH_HIGHLIGHT_MS}ms ease-out`
          : `rider-card-in 360ms cubic-bezier(.2,.8,.2,1) both`,
        animationDelay: fresh ? '0ms, 0ms' : `${mountDelayMs}ms`,
      }}
    >
      {fresh && (
        <span style={{
          position: 'absolute', top: -8, right: 8,
          fontSize: 9, fontWeight: 800, letterSpacing: 1,
          padding: '2px 6px', borderRadius: 100,
          background: '#00E676', color: '#080808',
        }}>
          JUST LIVE
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {/* Blurred synthetic avatar — same pool the driver landing uses */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          overflow: 'hidden', flexShrink: 0,
          border: '1.5px solid rgba(0,230,118,0.4)',
          position: 'relative',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrlFor(driver.handle)}
            alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              filter: 'blur(3px)', transform: 'scale(1.18)',
            }}
          />
        </div>
        <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{driver.name}</span>
      </div>
      <div style={{ fontSize: 11, color: '#888' }}>{driver.area}</div>
      <div style={{ fontSize: 11, color: '#00E676', marginTop: 2, fontWeight: 700 }}>
        {driver.price}
      </div>
    </div>
  );
}
