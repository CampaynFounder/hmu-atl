'use client';

import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onUpgraded: () => void;
}

export default function UpgradeOverlay({ open, onClose, onUpgraded }: Props) {
  const [loading, setLoading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confettiColors = ['#00E676', '#FFD600', '#FF4081', '#448AFF', '#E040FB', '#FF6E40'];
  const particles = upgraded ? Array.from({ length: 50 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 1.2,
    color: confettiColors[i % confettiColors.length],
    drift: (Math.random() - 0.5) * 100,
  })) : [];

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/upgrade', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      }
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  // Check if returning from successful checkout
  if (typeof window !== 'undefined' && !upgraded) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      // Confirm the upgrade server-side
      fetch('/api/driver/upgrade')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setUpgraded(true);
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
            setTimeout(() => {
              onUpgraded();
              window.location.reload();
            }, 3000);
          }
        })
        .catch(() => {});
    }
  }

  if (!open && !upgraded) return null;

  return (
    <>
      <style>{`
        .uo-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: flex-end; justify-content: center; }
        .uo-sheet { width: 100%; max-width: 420px; max-height: 90svh; background: #0a0a0a; border-radius: 24px 24px 0 0; padding: 28px 24px 40px; overflow-y: auto; position: relative; animation: uo-slideUp 0.3s ease-out; }
        @keyframes uo-slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .uo-handle { width: 40px; height: 4px; background: rgba(255,255,255,0.15); border-radius: 100px; margin: 0 auto 24px; }
        .uo-badge { display: inline-flex; align-items: center; gap: 6px; background: #00E676; color: #080808; font-size: 12px; font-weight: 800; padding: 6px 16px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; }
        .uo-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; line-height: 1; color: #fff; margin-bottom: 8px; }
        .uo-price { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 56px; color: #00E676; line-height: 1; margin-bottom: 4px; }
        .uo-price-sub { font-size: 14px; color: #888; margin-bottom: 24px; }
        .uo-perks { display: flex; flex-direction: column; gap: 14px; margin-bottom: 28px; }
        .uo-perk { display: flex; align-items: flex-start; gap: 12px; }
        .uo-perk-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
        .uo-perk-text { font-size: 14px; color: #bbb; line-height: 1.4; }
        .uo-perk-text strong { color: #fff; }
        .uo-btn { width: 100%; padding: 18px; border-radius: 100px; border: none; font-weight: 800; font-size: 17px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .uo-btn:active { transform: scale(0.97); }
        .uo-btn--primary { background: #00E676; color: #080808; }
        .uo-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .uo-btn--ghost { background: transparent; color: #888; margin-top: 12px; font-size: 14px; font-weight: 500; }
        .uo-error { font-size: 13px; color: #FF5252; margin-bottom: 12px; padding: 10px; background: rgba(255,68,68,0.08); border-radius: 10px; }
        .uo-guarantee { text-align: center; font-size: 12px; color: #555; margin-top: 16px; }

        /* Success state */
        .uo-success { position: fixed; inset: 0; z-index: 101; background: #080808; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
        @keyframes uo-badgeReveal { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 50% { transform: scale(1.2) rotate(5deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes uo-fadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes uo-confetti { 0% { transform: translateY(-10px) translateX(0) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; } }
        .uo-confetti-piece { position: absolute; top: 0; border-radius: 2px; pointer-events: none; }
      `}</style>

      {/* Success celebration */}
      {upgraded && (
        <div className="uo-success">
          {particles.map(p => (
            <div key={p.id} className="uo-confetti-piece" style={{
              left: `${p.x}%`, width: '7px', height: '10px',
              backgroundColor: p.color,
              // @ts-expect-error CSS custom property
              '--drift': `${p.drift}px`,
              animation: `uo-confetti ${2 + Math.random()}s ease-in ${p.delay}s forwards`,
            }} />
          ))}

          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px' }}>
            <div style={{
              fontSize: '80px', marginBottom: '20px',
              animation: 'uo-badgeReveal 0.8s ease-out forwards',
            }}>
              {'\uD83E\uDD47'}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
              fontSize: '40px', color: '#fff', lineHeight: 1, marginBottom: '12px',
              animation: 'uo-fadeUp 0.5s ease-out 0.4s both',
            }}>
              WELCOME TO HMU FIRST
            </h1>
            <p style={{
              fontSize: '15px', color: '#888', lineHeight: 1.5, marginBottom: '8px',
              animation: 'uo-fadeUp 0.5s ease-out 0.6s both',
            }}>
              Free instant payouts. Higher payouts. Priority placement.
            </p>
            <p style={{
              fontSize: '13px', color: '#00E676', fontWeight: 600,
              animation: 'uo-fadeUp 0.5s ease-out 0.8s both',
            }}>
              Refreshing your profile...
            </p>
          </div>
        </div>
      )}

      {/* Upgrade sheet */}
      {open && !upgraded && (
        <div className="uo-overlay" onClick={onClose}>
          <div className="uo-sheet" onClick={e => e.stopPropagation()}>
            <div className="uo-handle" />

            <div className="uo-badge">{'\uD83E\uDD47'} HMU First</div>
            <div className="uo-title">KEEP MORE OF EVERY RIDE</div>
            <div className="uo-price">$9.99</div>
            <div className="uo-price-sub">per month — cancel anytime</div>

            <div className="uo-perks">
              <div className="uo-perk">
                <span className="uo-perk-icon">{'\u26A1'}</span>
                <div className="uo-perk-text"><strong>Free instant payouts</strong> — cash out in minutes, no fee</div>
              </div>
              <div className="uo-perk">
                <span className="uo-perk-icon">{'\uD83D\uDCB0'}</span>
                <div className="uo-perk-text"><strong>Higher payouts</strong> — lower platform fee means more in your pocket</div>
              </div>
              <div className="uo-perk">
                <span className="uo-perk-icon">{'\uD83D\uDD1D'}</span>
                <div className="uo-perk-text"><strong>Priority placement</strong> — show up first in rider feeds</div>
              </div>
              <div className="uo-perk">
                <span className="uo-perk-icon">{'\uD83D\uDCAC'}</span>
                <div className="uo-perk-text"><strong>Read rider comments</strong> — know who you&apos;re picking up</div>
              </div>
              <div className="uo-perk">
                <span className="uo-perk-icon">{'\uD83C\uDFC5'}</span>
                <div className="uo-perk-text"><strong>HMU First badge</strong> — stand out on your profile</div>
              </div>
              <div className="uo-perk">
                <span className="uo-perk-icon">{'\uD83D\uDCC9'}</span>
                <div className="uo-perk-text"><strong>Lower daily cap</strong> — hit your cap faster, keep everything after</div>
              </div>
            </div>

            {error && <div className="uo-error">{error}</div>}

            <button
              type="button"
              className="uo-btn uo-btn--primary"
              onClick={handleUpgrade}
              disabled={loading}
            >
              {loading ? 'Opening checkout...' : 'Upgrade Now — $9.99/mo'}
            </button>

            <button type="button" className="uo-btn uo-btn--ghost" onClick={onClose}>
              Not now
            </button>

            <div className="uo-guarantee">
              Secure payment via Stripe. Cancel anytime from settings.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
