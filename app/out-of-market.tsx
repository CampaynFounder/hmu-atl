'use client';

import { useState } from 'react';

export default function OutOfMarketPage({ city }: { city?: string }) {
  const cityLabel = city || 'your city';
  const [phone, setPhone]       = useState('');
  const [status, setStatus]     = useState<'idle' | 'loading' | 'done' | 'err'>('idle');
  const [errMsg, setErrMsg]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrMsg('');
    try {
      const res = await fetch('/api/public/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, city }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setErrMsg(data.error || 'Something went wrong'); setStatus('err'); return; }
      setStatus('done');
    } catch {
      setErrMsg('Network error — try again');
      setStatus('err');
    }
  }

  return (
    <div style={{
      minHeight: '100svh',
      background: '#080808',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>

        {/* Wordmark */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 36,
          color: '#00E676',
          letterSpacing: 2,
          marginBottom: 32,
        }}>
          HMU CASH RIDE
        </div>

        {status === 'done' ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28, color: '#fff', letterSpacing: 1, marginBottom: 12,
            }}>
              YOU'RE ON THE LIST
            </div>
            <p style={{ color: '#888', fontSize: 15, lineHeight: 1.5 }}>
              We'll text you the second HMU drops in {cityLabel}.
              Tell a driver in your city — the faster we fill supply, the faster we launch.
            </p>
          </>
        ) : (
          <>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: city ? 30 : 26,
              color: '#fff',
              letterSpacing: 1,
              lineHeight: 1.15,
              marginBottom: 16,
            }}>
              {city
                ? `HMU ISN'T IN ${city.toUpperCase()} YET`
                : "HMU ISN'T IN YOUR CITY YET"}
            </div>

            <p style={{ color: '#888', fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
              We're expanding. Safer rides, local drivers, cash prices that make sense.
              Drop your number — you'll be first to know when we land.
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Your phone number"
                required
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: '#141414',
                  border: '1px solid rgba(0,230,118,0.3)',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 12,
                  textAlign: 'center',
                  letterSpacing: 1,
                }}
              />

              {(status === 'err') && (
                <div style={{
                  color: '#ef4444', fontSize: 13,
                  marginBottom: 10,
                }}>
                  {errMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: status === 'loading' ? '#333' : '#00E676',
                  color: status === 'loading' ? '#666' : '#080808',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  cursor: status === 'loading' ? 'default' : 'pointer',
                }}
              >
                {status === 'loading' ? 'Saving…' : 'NOTIFY ME WHEN HMU DROPS'}
              </button>
            </form>

            <p style={{ color: '#555', fontSize: 12, marginTop: 20, lineHeight: 1.5 }}>
              We'll text you once when we launch in {cityLabel}. No spam. Reply STOP to cancel.
            </p>
          </>
        )}

        <div style={{ marginTop: 40, borderTop: '1px solid #1a1a1a', paddingTop: 24 }}>
          <p style={{ color: '#444', fontSize: 12 }}>
            Already in Atlanta or New Orleans?{' '}
            <a href="https://atl.hmucashride.com" style={{ color: '#00E676', textDecoration: 'none' }}>
              ATL
            </a>
            {' · '}
            <a href="https://nola.hmucashride.com" style={{ color: '#00E676', textDecoration: 'none' }}>
              NOLA
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
