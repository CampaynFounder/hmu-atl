'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

// Pool of mock rider personas. We display VISIBLE_COUNT at a time and rotate
// one in / one out on a timer so the page feels live across visits and within
// a single session. Avatars are CSS gradients keyed off `hue` — no PII, no
// network round-trips, no third-party assets.
interface MockRider {
  handle: string;
  initials: string;
  area: string;
  vibe: string;
  price: string;
  baseMinutesAgo: number;
  hue: number;
}

const POOL: MockRider[] = [
  { handle: 'tay',       initials: 'T',  area: 'Eastside',           vibe: 'HMU $20 to Midtown',   price: '$20', baseMinutesAgo: 2,  hue: 162 },
  { handle: 'jaz',       initials: 'JZ', area: 'Lenox',              vibe: 'Ride to airport ASAP', price: '$35', baseMinutesAgo: 4,  hue: 200 },
  { handle: 'kayla',     initials: 'K',  area: 'East Atlanta',       vibe: 'Need a chill driver',  price: '$18', baseMinutesAgo: 5,  hue: 32  },
  { handle: 'dre',       initials: 'D',  area: 'West End',           vibe: 'HMU $15 grocery run',  price: '$15', baseMinutesAgo: 7,  hue: 280 },
  { handle: 'brittany',  initials: 'B',  area: 'Buckhead',           vibe: 'Out the spot in 15',   price: '$25', baseMinutesAgo: 9,  hue: 340 },
  { handle: 'mar',       initials: 'M',  area: 'Decatur',            vibe: 'Pull up please',       price: '$22', baseMinutesAgo: 11, hue: 100 },
  { handle: 'sav',       initials: 'SV', area: 'Old Fourth Ward',    vibe: 'HMU sis it’s late', price: '$30', baseMinutesAgo: 13, hue: 210 },
  { handle: 'jordan',    initials: 'J',  area: 'Smyrna',             vibe: 'Need a ride to work',  price: '$17', baseMinutesAgo: 14, hue: 150 },
  { handle: 'malia',     initials: 'ML', area: 'Atlantic Station',   vibe: 'Heading downtown',     price: '$19', baseMinutesAgo: 3,  hue: 12  },
  { handle: 'reggie',    initials: 'R',  area: 'College Park',       vibe: 'Airport in 30',        price: '$28', baseMinutesAgo: 6,  hue: 250 },
  { handle: 'nia',       initials: 'N',  area: 'Vinings',            vibe: 'Pull up — quick run',  price: '$16', baseMinutesAgo: 8,  hue: 320 },
  { handle: 'kj',        initials: 'KJ', area: 'Sandy Springs',      vibe: 'Need a chill aunty',   price: '$22', baseMinutesAgo: 10, hue: 180 },
  { handle: 'shay',      initials: 'S',  area: 'Inman Park',         vibe: 'HMU after the show',   price: '$24', baseMinutesAgo: 12, hue: 60  },
  { handle: 'cam',       initials: 'C',  area: 'Midtown',            vibe: 'Need a ride home',     price: '$18', baseMinutesAgo: 4,  hue: 130 },
  { handle: 'destiny',   initials: 'DS', area: 'East Point',         vibe: 'HMU $25 round trip',   price: '$25', baseMinutesAgo: 9,  hue: 300 },
  { handle: 'amir',      initials: 'A',  area: 'Edgewood',           vibe: 'Pulling up to work',   price: '$15', baseMinutesAgo: 1,  hue: 200 },
  { handle: 'quinn',     initials: 'Q',  area: 'Cabbagetown',        vibe: 'Late night ride',      price: '$22', baseMinutesAgo: 6,  hue: 90  },
  { handle: 'taj',       initials: 'TJ', area: 'Kirkwood',           vibe: 'Need a vibe driver',   price: '$20', baseMinutesAgo: 11, hue: 230 },
];

const VISIBLE_COUNT = 8;
// One card swaps every 7s so the feed always feels alive but never frantic.
const ROTATION_MS = 7_000;
// Age tick — drives "minutes ago" forward so the same card grows older
// while it's on screen.
const AGE_TICK_MS = 30_000;

// Time-seeded shuffle — different visit, different order, but stable for the
// life of one session so cards don't jump on every render.
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

export function ExpressLandingClient() {
  const router = useRouter();

  // Everyone in the same minute sees the same order, but the next minute
  // (or the next visitor) gets a freshly shuffled deck.
  const seed = useMemo(() => Math.floor(Date.now() / 60_000), []);
  const ordered = useMemo(() => seededShuffle(POOL, seed), [seed]);

  const [visibleIds, setVisibleIds] = useState<string[]>(() =>
    ordered.slice(0, VISIBLE_COUNT).map((r) => r.handle),
  );
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Live age — bumps every AGE_TICK_MS. The visible "Xm ago" reads off this
  // counter so it ages forward in real time.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), AGE_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Card rotation — pop the oldest card off, push a fresh one from the pool.
  // The new card flashes a "JUST POSTED" highlight for ~3s, then fades to
  // normal so the eye is drawn to it without being distracting.
  useEffect(() => {
    const id = window.setInterval(() => {
      setVisibleIds((prev) => {
        const offdeck = ordered.filter((r) => !prev.includes(r.handle));
        if (offdeck.length === 0) return prev;
        const incoming = offdeck[Math.floor(Math.random() * offdeck.length)];
        const next = [incoming.handle, ...prev.slice(0, -1)];
        setRecentlyAdded(incoming.handle);
        window.setTimeout(() => setRecentlyAdded((cur) => (cur === incoming.handle ? null : cur)), 3_000);
        return next;
      });
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [ordered]);

  function goSignUp() {
    // Single funnel for any tap. mode=express + type=driver routes through
    // sign-up → auth-callback → /onboarding?mode=express → DriverOnboardingExpress.
    router.push('/sign-up?type=driver&mode=express');
  }

  const visible = visibleIds
    .map((id) => POOL.find((r) => r.handle === id))
    .filter((r): r is MockRider => !!r);

  return (
    <div
      style={{
        minHeight: '100svh',
        background:
          'radial-gradient(circle at 50% 0%, rgba(0,230,118,0.08) 0%, transparent 50%), #050505',
        color: '#fff',
        paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 999,
              background: 'rgba(0,230,118,0.12)',
              color: '#00E676',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: 999, background: '#00E676' }}
            />
            Live in ATL
          </div>
          <h1
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 44,
              lineHeight: 1,
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            MAKE MORE $$$
          </h1>
          <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.5, padding: '0 8px' }}>
            Real riders looking for a ride right now. Tap one to start &mdash; sign up in under a minute.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((r, i) => (
              <RiderCard
                key={r.handle}
                rider={r}
                index={i}
                tick={tick}
                isFresh={recentlyAdded === r.handle}
                onTap={goSignUp}
              />
            ))}
          </AnimatePresence>
        </div>

        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <button
            type="button"
            onClick={goSignUp}
            style={{
              width: '100%',
              padding: '18px',
              borderRadius: 100,
              border: 'none',
              background: '#00E676',
              color: '#080808',
              fontWeight: 800,
              fontSize: 17,
              cursor: 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              boxShadow: '0 8px 32px rgba(0,230,118,0.25)',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'rgba(0,0,0,0)',
            }}
          >
            Start earning today
          </button>
          <div style={{ fontSize: 11, color: '#666', marginTop: 10 }}>
            Express signup &middot; Set govt name + plate later
          </div>
        </div>
      </div>
    </div>
  );
}

function RiderCard({
  rider,
  index,
  tick,
  isFresh,
  onTap,
}: {
  rider: MockRider;
  index: number;
  tick: number;
  isFresh: boolean;
  onTap: () => void;
}) {
  // Each tick is 30s; we age in 1m increments after every other tick.
  const drifted = rider.baseMinutesAgo + Math.floor(tick / 2);
  const ageLabel = isFresh ? 'Just now' : `${drifted}m ago`;

  return (
    <motion.button
      type="button"
      onClick={onTap}
      layout
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.96 }}
      transition={{ delay: 0.06 * Math.min(index, 4), duration: 0.4, ease: 'easeOut' }}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -2 }}
      style={{
        textAlign: 'left',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        border: isFresh ? '1px solid rgba(0,230,118,0.4)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 14,
        color: '#fff',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isFresh ? '0 0 0 4px rgba(0,230,118,0.08)' : 'none',
        transition: 'border 0.4s ease, box-shadow 0.4s ease',
      }}
    >
      {/* live pulse */}
      <motion.div
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: index * 0.3 }}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 8,
          height: 8,
          borderRadius: 999,
          background: '#00E676',
          boxShadow: '0 0 0 4px rgba(0,230,118,0.18)',
        }}
      />

      {isFresh && (
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: '#00E676',
            color: '#0a0a0a',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 6,
          }}
        >
          Just posted
        </motion.div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: isFresh ? 12 : 0 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: `linear-gradient(135deg, hsl(${rider.hue} 70% 55%) 0%, hsl(${(rider.hue + 30) % 360} 70% 35%) 100%)`,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 14,
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: 1,
          }}
        >
          {rider.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>@{rider.handle}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{rider.area}</div>
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          color: '#ddd',
          lineHeight: 1.4,
          marginBottom: 12,
          minHeight: 36,
        }}
      >
        {rider.vibe}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: '#00E676',
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          }}
        >
          {rider.price}
        </span>
        <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {ageLabel}
        </span>
      </div>
    </motion.button>
  );
}
