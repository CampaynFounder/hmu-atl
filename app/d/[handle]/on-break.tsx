'use client';

import { useState } from 'react';
import Link from 'next/link';

export function DriverOnBreak({ handle }: { handle: string }) {
  const [route, setRoute] = useState('');
  const [uberPrice, setUberPrice] = useState(40);

  const hmuPrice = Math.round(uberPrice * 0.48);
  const savings = uberPrice - hmuPrice;

  return (
    <div style={{
      background: '#080808', color: '#fff', minHeight: '100svh',
      fontFamily: "'DM Sans', sans-serif", paddingTop: 56,
    }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '48px 24px 32px' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>{'\uD83D\uDE97'}</div>
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 36,
          lineHeight: 1, marginBottom: 8,
        }}>
          @{handle} IS ON BREAK
        </h1>
        <p style={{ fontSize: 15, color: '#888', lineHeight: 1.5, maxWidth: 340, margin: '0 auto' }}>
          Sign up and post your ride — just like on Cash Rides FB. Name your price, get ETA tracking, and GPS on every ride.
        </p>
      </div>

      {/* Savings Calculator */}
      <div style={{ padding: '0 20px 32px' }}>
        <div style={{
          background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '24px 20px', overflow: 'hidden',
        }}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 10, color: '#888',
            letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16,
          }}>
            See How Much You&apos;d Save
          </div>

          {/* Route input (cosmetic) */}
          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="e.g. Candler Road > Buckhead"
            style={{
              width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 15,
              outline: 'none', marginBottom: 16, boxSizing: 'border-box',
              fontFamily: "'DM Sans', sans-serif",
            }}
          />

          {/* Uber price input */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: '#bbb', marginBottom: 8, display: 'block' }}>
              What is Uber / Lyft quoting you?
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 36,
                color: '#FF5252', lineHeight: 1, flexShrink: 0,
              }}>
                ${uberPrice}
              </span>
              <input
                type="range"
                min={10}
                max={150}
                value={uberPrice}
                onChange={(e) => setUberPrice(Number(e.target.value))}
                style={{
                  flex: 1, height: 6, appearance: 'none', background: '#333',
                  borderRadius: 3, outline: 'none',
                  accentColor: '#FF5252',
                }}
              />
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />

          {/* HMU Price */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
              HMU drivers usually charge
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 64,
              color: '#00E676', lineHeight: 1,
              transition: 'all 0.3s ease-out',
            }}>
              ${hmuPrice}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
              for the same ride
            </div>
          </div>

          {/* Savings callout */}
          <div style={{
            background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
            borderRadius: 14, padding: '14px 16px', textAlign: 'center',
            marginBottom: 16,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28,
              color: '#00E676', lineHeight: 1,
            }}>
              YOU&apos;D SAVE ${savings}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              No surge pricing. No service fees. No booking fees.
            </div>
          </div>

          {/* How it works mini */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {[
              { num: '1', text: 'Post your route and name your price' },
              { num: '2', text: 'A local driver accepts your offer' },
              { num: '3', text: 'Track their ETA and GPS in real-time' },
            ].map(s => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'rgba(0,230,118,0.12)', color: '#00E676',
                  fontSize: 12, fontWeight: 700, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {s.num}
                </div>
                <span style={{ fontSize: 13, color: '#bbb' }}>{s.text}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link
            href="/sign-up?type=rider"
            style={{
              display: 'block', width: '100%', padding: 16, borderRadius: 100,
              border: 'none', background: '#00E676', color: '#080808',
              fontSize: 16, fontWeight: 700, textDecoration: 'none',
              textAlign: 'center', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Stop Overpaying For Rides
          </Link>
        </div>
      </div>

      {/* Driver CTA */}
      <div style={{ padding: '0 20px 60px', textAlign: 'center' }}>
        <Link
          href="/sign-up?type=driver"
          style={{
            display: 'inline-block', padding: '14px 32px', borderRadius: 100,
            border: '1px solid rgba(0,230,118,0.2)', background: 'transparent',
            color: '#00E676', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Or Get Free HMU Driver Profile
        </Link>

        <div style={{
          marginTop: 32, background: '#00E676', color: '#080808',
          fontWeight: 700, fontSize: 10, letterSpacing: 2,
          textTransform: 'uppercase', padding: '6px 16px',
          borderRadius: 100, display: 'inline-block',
        }}>
          HMU ATL
        </div>
      </div>
    </div>
  );
}
