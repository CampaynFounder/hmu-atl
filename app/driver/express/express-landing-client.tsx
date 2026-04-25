'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

// Hand-curated mock rider profiles. Names + neighborhoods chosen to mirror
// the kind of demand a new driver actually sees. Avatars use Unicode
// initials with a deterministic gradient background — no PII, no third-party
// asset cost.
interface MockRider {
  handle: string;
  initials: string;
  area: string;
  vibe: string;
  price: string;
  minutesAgo: number;
  hue: number; // for avatar gradient
}

const MOCK_RIDERS: MockRider[] = [
  { handle: 'tay', initials: 'T',  area: 'Eastside',          vibe: 'HMU $20 to Midtown',   price: '$20',  minutesAgo: 2,  hue: 162 },
  { handle: 'jaz', initials: 'JZ', area: 'Lenox',             vibe: 'Ride to airport ASAP', price: '$35',  minutesAgo: 4,  hue: 200 },
  { handle: 'kayla', initials: 'K', area: 'East Atlanta',     vibe: 'Need a chill driver',  price: '$18',  minutesAgo: 5,  hue: 32  },
  { handle: 'dre', initials: 'D',  area: 'West End',           vibe: 'HMU $15 grocery run',  price: '$15',  minutesAgo: 7,  hue: 280 },
  { handle: 'brittany', initials: 'B', area: 'Buckhead',      vibe: 'Out the spot in 15',   price: '$25',  minutesAgo: 9,  hue: 340 },
  { handle: 'mar', initials: 'M',  area: 'Decatur',            vibe: 'Pull up please',       price: '$22',  minutesAgo: 11, hue: 100 },
  { handle: 'sav', initials: 'SV', area: 'Old Fourth Ward',    vibe: 'HMU sis it’s late', price: '$30',  minutesAgo: 13, hue: 210 },
  { handle: 'jordan', initials: 'J', area: 'Smyrna',          vibe: 'Need a ride to work',  price: '$17',  minutesAgo: 14, hue: 150 },
];

export function ExpressLandingClient() {
  const router = useRouter();
  const [now, setNow] = useState<number>(0);

  // Tick once a minute so the "minutes ago" counters drift forward —
  // sells the live-feed feeling without doing any work.
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  function goSignUp() {
    // Single funnel for any tap. mode=express + type=driver routes through
    // sign-up → auth-callback → /onboarding?mode=express → DriverOnboardingExpress.
    router.push('/sign-up?type=driver&mode=express');
  }

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
              display: 'inline-block',
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
          <AnimatePresence>
            {MOCK_RIDERS.map((r, i) => (
              <RiderCard key={r.handle} rider={r} index={i} now={now} onTap={goSignUp} />
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
  now,
  onTap,
}: {
  rider: MockRider;
  index: number;
  now: number;
  onTap: () => void;
}) {
  // Scale the "minutes ago" forward by however long the page has been open.
  const elapsed = now ? Math.floor((now - performance.timeOrigin) / 60_000) : 0;
  const drifted = rider.minutesAgo + elapsed;

  return (
    <motion.button
      type="button"
      onClick={onTap}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ delay: 0.08 * index, duration: 0.4, ease: 'easeOut' }}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -2 }}
      style={{
        textAlign: 'left',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 14,
        color: '#fff',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* subtle "live" pulse */}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
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
          {drifted}m ago
        </span>
      </div>
    </motion.button>
  );
}
