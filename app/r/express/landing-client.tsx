'use client';

// Unauthed landing for /r/express. Single CTA → /sign-up with returnTo back
// to /r/express, where the onboarding host takes over post-auth.
// Conversion-optimised: one above-the-fold value prop, three trust pillars,
// no nav, no scroll-baited content. Mock driver row gives social proof
// without being a full feed.

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';

const PILLARS = [
  { icon: '💸', title: 'Real local prices',    body: 'Pay fair. No surge bullshit.' },
  { icon: '🛡️', title: 'Payment held safely', body: 'Driver paid only after the ride.' },
  { icon: '📍', title: 'Tracked end-to-end',   body: 'Every ride GPS-recorded.' },
];

const MOCK_DRIVERS = [
  { name: 'Tay D.',     area: 'Eastside',     price: '$15+', emoji: '🚗' },
  { name: 'Marcus J.',  area: 'Buckhead',     price: '$18+', emoji: '🚙' },
  { name: 'Aaliyah K.', area: 'Decatur',      price: '$12+', emoji: '🚘' },
  { name: 'D-Ray',      area: 'College Park', price: '$14+', emoji: '🚐' },
];

export function LandingClient() {
  const router = useRouter();

  useEffect(() => {
    fbEvent('ViewContent', { content_name: 'rider_ad_funnel_landing', content_category: 'rider_funnel' });
    fbCustomEvent('FunnelLead_landing', { funnel_stage: 'landing', audience: 'rider_ad_funnel' });
  }, []);

  // Tiny live-feel: shuffle mock drivers per render
  const drivers = useMemo(() => {
    const a = MOCK_DRIVERS.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, []);

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
          Skip the surge. Pick your driver. Pay only when the ride is done.
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

        {/* Mock driver strip — social proof without a full feed */}
        <div style={{
          fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1,
          marginBottom: 8, textAlign: 'center', fontWeight: 700,
        }}>
          Drivers live right now
        </div>
        <div style={{
          display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto',
          paddingBottom: 4, scrollbarWidth: 'none' as const,
        }}>
          {drivers.map((d) => (
            <div key={d.name} style={{
              flexShrink: 0, padding: '10px 12px', borderRadius: 12,
              background: '#141414', border: '1px solid rgba(0,230,118,0.18)',
              minWidth: 140,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
              }}>
                <span style={{ fontSize: 18 }}>{d.emoji}</span>
                <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{d.name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>{d.area}</div>
              <div style={{ fontSize: 11, color: '#00E676', marginTop: 2, fontWeight: 700 }}>
                {d.price}
              </div>
            </div>
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
          Get Started — 60 seconds
        </button>

        <p style={{
          fontSize: 11, color: '#555', textAlign: 'center', marginTop: 14,
          lineHeight: 1.5,
        }}>
          Free to sign up. Card linked when you book your first ride.
        </p>
      </div>
    </div>
  );
}
