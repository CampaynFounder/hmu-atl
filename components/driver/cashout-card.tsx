'use client';

import { useState, useEffect } from 'react';
import { fbCustomEvent } from '@/components/analytics/meta-pixel';
import UpgradeOverlay from './upgrade-overlay';

interface BalanceData {
  available: number;
  pending: number;
  instantAvailable: number;
  instantEligible: boolean;
  tier: string;
}

export default function CashoutCard() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashingOut, setCashingOut] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [result, setResult] = useState<{ amount: number; method: string; fee: number; arrival: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'standard' | 'instant'>('standard');
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    fetch('/api/driver/balance')
      .then(r => r.json())
      .then(data => { if (!data.error) setBalance(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isHmuFirst = balance?.tier === 'hmu_first';
  // Show the max cashable amount — instant_available includes pending funds Stripe will front
  const cashableAmount = balance ? Math.max(balance.available, balance.instantAvailable ?? 0) : 0;
  const instantFee = isHmuFirst ? 0 : Math.max(1, cashableAmount * 0.01);

  async function handleCashout() {
    fbCustomEvent('CashoutInitiated', { amount: balance?.available, method: selectedMethod, tier: balance?.tier });
    setCashingOut(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: selectedMethod }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setCashingOut(false);
        return;
      }
      fbCustomEvent('CashoutCompleted', { amount: data.amount, method: data.method, fee: data.fee });
      setResult(data);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
      // Refresh balance
      const balRes = await fetch('/api/driver/balance');
      if (balRes.ok) setBalance(await balRes.json());
    } catch {
      setError('Network error');
    } finally {
      setCashingOut(false);
    }
  }

  if (loading) return null;
  if (!balance) return null;

  const confettiColors = ['#00E676', '#FFD600', '#FF4081', '#448AFF', '#E040FB'];
  const particles = showConfetti ? Array.from({ length: 40 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 1,
    color: confettiColors[i % confettiColors.length], drift: (Math.random() - 0.5) * 80,
  })) : [];

  return (
    <>
      <style>{`
        .co-card { background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 24px 20px; margin-bottom: 16px; position: relative; overflow: hidden; }
        .co-tier { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 4px 10px; border-radius: 100px; margin-bottom: 12px; }
        .co-tier--free { background: #1a1a1a; color: #888; border: 1px solid rgba(255,255,255,0.08); }
        .co-tier--first { background: #00E676; color: #080808; }
        .co-title { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: #888; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 6px; }
        .co-amount { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 48px; color: #00E676; line-height: 1; margin-bottom: 4px; }
        .co-amount--zero { color: #555; }
        .co-pending { font-size: 12px; color: #888; margin-bottom: 20px; }
        .co-methods { display: flex; gap: 8px; margin-bottom: 16px; }
        .co-method { flex: 1; padding: 14px 12px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.08); background: #1a1a1a; cursor: pointer; text-align: center; transition: all 0.15s; }
        .co-method:active { transform: scale(0.97); }
        .co-method--selected { border-color: #00E676; background: rgba(0,230,118,0.06); }
        .co-method-label { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 2px; }
        .co-method-sub { font-size: 11px; color: #888; }
        .co-method-fee { font-size: 11px; color: #00E676; font-weight: 600; margin-top: 4px; }
        .co-method-fee--paid { color: #FFB300; }
        .co-btn { width: 100%; padding: 16px; border-radius: 100px; border: none; font-weight: 700; font-size: 16px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .co-btn:active { transform: scale(0.97); }
        .co-btn--green { background: #00E676; color: #080808; }
        .co-btn--green:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .co-upgrade { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 12px 16px; background: rgba(0,230,118,0.06); border: 1px solid rgba(0,230,118,0.15); border-radius: 12px; text-decoration: none; transition: all 0.15s; }
        .co-upgrade:active { transform: scale(0.98); }
        .co-upgrade-text { flex: 1; font-size: 13px; color: #00E676; font-weight: 500; }
        .co-upgrade-arrow { color: #00E676; font-size: 16px; }
        .co-error { font-size: 13px; color: #FF5252; margin-bottom: 12px; padding: 10px 14px; background: rgba(255,68,68,0.08); border-radius: 10px; }
        .co-result { text-align: center; padding: 16px 0; }
        .co-result-icon { font-size: 40px; margin-bottom: 8px; }
        .co-result-amount { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; color: #00E676; }
        .co-result-sub { font-size: 13px; color: #888; margin-top: 4px; }
        @keyframes coConfetti {
          0% { transform: translateY(-10px) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(300px) translateX(var(--drift)) rotate(540deg); opacity: 0; }
        }
        .co-confetti { position: absolute; top: 0; width: 6px; height: 9px; border-radius: 2px; pointer-events: none; }
      `}</style>

      <div className="co-card">
        {/* Confetti */}
        {particles.map(p => (
          <div key={p.id} className="co-confetti" style={{
            left: `${p.x}%`, backgroundColor: p.color,
            // @ts-expect-error CSS custom property
            '--drift': `${p.drift}px`,
            animation: `coConfetti ${1.5 + Math.random()}s ease-in ${p.delay}s forwards`,
          }} />
        ))}

        {/* Tier badge */}
        <div className={`co-tier ${isHmuFirst ? 'co-tier--first' : 'co-tier--free'}`}>
          {isHmuFirst ? '\uD83E\uDD47 HMU First' : 'Free Tier'}
        </div>

        <div className="co-title">Available Balance</div>
        <div className={`co-amount ${cashableAmount <= 0 ? 'co-amount--zero' : ''}`}>
          ${cashableAmount.toFixed(2)}
        </div>
        {balance.available <= 0 && cashableAmount > 0 && (
          <div className="co-pending" style={{ color: '#00E676' }}>Ready for instant payout</div>
        )}

        {error && <div className="co-error">{error}</div>}

        {result ? (
          <div className="co-result">
            <div className="co-result-icon">{'\uD83D\uDCB8'}</div>
            <div className="co-result-amount">${result.amount.toFixed(2)}</div>
            <div className="co-result-sub">
              {result.method === 'instant' ? 'On its way — arrives in minutes' : 'On its way — 1-2 business days'}
              {result.fee > 0 && ` ($${result.fee.toFixed(2)} fee)`}
            </div>
          </div>
        ) : (
          <>
            {/* Method picker — always visible */}
            <div className="co-methods">
              <div
                className={`co-method ${selectedMethod === 'standard' ? 'co-method--selected' : ''}`}
                onClick={() => setSelectedMethod('standard')}
              >
                <div className="co-method-label">Standard</div>
                <div className="co-method-sub">1-2 business days</div>
                <div className="co-method-fee">FREE</div>
              </div>
              <div
                className={`co-method ${selectedMethod === 'instant' ? 'co-method--selected' : ''}`}
                onClick={() => setSelectedMethod('instant')}
              >
                <div className="co-method-label">Instant {'\u26A1'}</div>
                <div className="co-method-sub">Arrives in minutes</div>
                {isHmuFirst ? (
                  <div className="co-method-fee">FREE {'\uD83E\uDD47'}</div>
                ) : (
                  <div className="co-method-fee co-method-fee--paid">
                    $1 or 1%
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="co-btn co-btn--green"
              onClick={handleCashout}
              disabled={cashingOut || cashableAmount <= 0}
            >
              {cashingOut ? 'Processing...' : cashableAmount > 0 ? `Cash Out $${cashableAmount.toFixed(2)}` : 'No balance yet — complete a ride'}
            </button>

            {!isHmuFirst && (
              <button type="button" className="co-upgrade" onClick={() => setShowUpgrade(true)} style={{ width: '100%', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}>
                <span className="co-upgrade-text">
                  {'\uD83E\uDD47'} Upgrade to HMU First — keep more + free instant payouts
                </span>
                <span className="co-upgrade-arrow">{'\u203A'}</span>
              </button>
            )}

            <UpgradeOverlay
              open={showUpgrade}
              onClose={() => setShowUpgrade(false)}
              onUpgraded={() => { setShowUpgrade(false); window.location.reload(); }}
            />
          </>
        )}
      </div>
    </>
  );
}
