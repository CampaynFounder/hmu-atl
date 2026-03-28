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
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'standard' | 'instant'>('standard');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [showSlider, setShowSlider] = useState(false);

  useEffect(() => {
    fetch('/api/driver/balance')
      .then(r => r.json())
      .then(data => { if (!data.error) setBalance(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isHmuFirst = balance?.tier === 'hmu_first';
  const cashableAmount = balance ? Math.max(balance.available, balance.instantAvailable ?? 0) : 0;

  // Set default payout amount when balance loads
  useEffect(() => {
    if (cashableAmount > 0 && payoutAmount === 0) {
      setPayoutAmount(cashableAmount);
    }
  }, [cashableAmount, payoutAmount]);

  // Calculate fee based on selected amount and method
  const calculateFee = (amount: number, method: 'standard' | 'instant') => {
    if (method === 'standard') return 0;
    if (isHmuFirst) return 0;
    const percentFee = amount * 0.01;
    return Math.max(1, Math.round(percentFee * 100) / 100);
  };

  const currentFee = calculateFee(payoutAmount, selectedMethod);
  const driverReceives = Math.max(0, payoutAmount - currentFee);

  // Minimum payout: $1 or the fee + $1, whichever lets driver receive something
  const minPayout = selectedMethod === 'instant' && !isHmuFirst
    ? Math.min(cashableAmount, 2) // At least $2 so driver gets $1 after fee
    : Math.min(cashableAmount, 1);

  const handleMethodSelect = (method: 'standard' | 'instant') => {
    setSelectedMethod(method);
    setShowSlider(true);
    // Reset to max when switching methods
    setPayoutAmount(cashableAmount);
  };

  async function handleCashout() {
    fbCustomEvent('CashoutInitiated', { amount: payoutAmount, method: selectedMethod, tier: balance?.tier });
    setCashingOut(true);
    setError(null);
    setErrorDetail(null);
    setErrorType(null);
    try {
      const res = await fetch('/api/driver/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: selectedMethod, amount: payoutAmount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setErrorDetail(data.detail ?? null);
        setErrorType(data.errorType ?? null);
        setCashingOut(false);
        return;
      }
      fbCustomEvent('CashoutCompleted', { amount: data.amount, method: data.method, fee: data.fee });
      setResult(data);
      setShowConfetti(true);
      setShowSlider(false);
      setTimeout(() => setShowConfetti(false), 4000);
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

  const sliderPercent = cashableAmount > 0 ? ((payoutAmount - minPayout) / (cashableAmount - minPayout)) * 100 : 0;

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
        .co-slider-section { margin-bottom: 20px; }
        .co-slider-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
        .co-slider-amount { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; color: #fff; line-height: 1; }
        .co-slider-max { font-size: 11px; color: #888; cursor: pointer; padding: 4px 10px; border-radius: 100px; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08); }
        .co-slider-max:active { background: #222; }
        .co-slider-track { position: relative; width: 100%; height: 40px; display: flex; align-items: center; touch-action: none; }
        .co-slider-rail { width: 100%; height: 6px; background: #222; border-radius: 3px; position: relative; overflow: hidden; }
        .co-slider-fill { position: absolute; left: 0; top: 0; height: 100%; background: #00E676; border-radius: 3px; transition: width 0.05s; }
        .co-slider-input { position: absolute; width: 100%; height: 100%; opacity: 0; cursor: pointer; margin: 0; -webkit-appearance: none; }
        .co-slider-thumb { position: absolute; top: 50%; width: 28px; height: 28px; background: #00E676; border: 3px solid #080808; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; box-shadow: 0 2px 8px rgba(0,230,118,0.3); transition: left 0.05s; }
        .co-breakdown { margin-top: 14px; padding: 12px 14px; background: #1a1a1a; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); }
        .co-breakdown-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
        .co-breakdown-label { font-size: 12px; color: #888; }
        .co-breakdown-value { font-size: 12px; color: #fff; font-weight: 500; }
        .co-breakdown-value--green { color: #00E676; }
        .co-breakdown-value--yellow { color: #FFB300; }
        .co-breakdown-divider { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 6px 0; }
        .co-breakdown-total { font-size: 14px; font-weight: 700; }
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
        {cashableAmount > 0 && balance.available <= 0 && (
          <div style={{
            background: 'rgba(255,179,0,0.06)',
            border: '1px solid rgba(255,179,0,0.15)',
            borderRadius: '12px',
            padding: '10px 14px',
            marginBottom: '16px',
            marginTop: '4px',
          }}>
            <div style={{ fontSize: '12px', color: '#FFB300', fontWeight: 600, marginBottom: '4px' }}>
              Stripe is verifying your account
            </div>
            <div style={{ fontSize: '11px', color: '#999', lineHeight: 1.5 }}>
              New accounts have a 1-2 day hold on first payouts while Stripe confirms your identity. Your ${cashableAmount.toFixed(2)} is safe — you&apos;ll be able to cash out soon.
            </div>
          </div>
        )}
        {cashableAmount > 0 && balance.available > 0 && balance.available === cashableAmount && (
          <div className="co-pending" style={{ color: '#00E676' }}>Ready to cash out</div>
        )}

        {error && (
          <div style={{
            marginBottom: '12px',
            borderRadius: '14px',
            overflow: 'hidden',
            border: errorType === 'instant_limit' ? '1px solid rgba(255,179,0,0.25)' : '1px solid rgba(255,68,68,0.25)',
          }}>
            <div style={{
              padding: '12px 14px',
              background: errorType === 'instant_limit' ? 'rgba(255,179,0,0.08)' : 'rgba(255,68,68,0.08)',
              color: errorType === 'instant_limit' ? '#FFB300' : '#FF5252',
              fontSize: '13px',
              fontWeight: 600,
            }}>
              {error}
            </div>
            {errorDetail && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.02)',
                color: '#aaa',
                fontSize: '12px',
                lineHeight: 1.5,
              }}>
                {errorDetail}
              </div>
            )}
            {errorType === 'instant_limit' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMethod('standard');
                  setError(null);
                  setErrorDetail(null);
                  setErrorType(null);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(0,230,118,0.06)',
                  color: '#00E676',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                }}
              >
                Switch to Standard Payout (Free)
              </button>
            )}
            {errorType === 'pending_hold' && (
              <button
                type="button"
                onClick={() => { setError(null); setErrorDetail(null); setErrorType(null); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  color: '#888',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                }}
              >
                Got it
              </button>
            )}
          </div>
        )}

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
            {/* Method picker */}
            <div className="co-methods">
              <div
                className={`co-method ${selectedMethod === 'standard' ? 'co-method--selected' : ''}`}
                onClick={() => handleMethodSelect('standard')}
              >
                <div className="co-method-label">Standard</div>
                <div className="co-method-sub">1-2 business days</div>
                <div className="co-method-fee">FREE</div>
              </div>
              <div
                className={`co-method ${selectedMethod === 'instant' ? 'co-method--selected' : ''}`}
                onClick={() => handleMethodSelect('instant')}
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

            {/* Amount Slider — shows after selecting a method */}
            {showSlider && cashableAmount > 0 && (
              <div className="co-slider-section">
                <div className="co-slider-header">
                  <div className="co-slider-amount">${payoutAmount.toFixed(2)}</div>
                  <button
                    type="button"
                    className="co-slider-max"
                    onClick={() => setPayoutAmount(cashableAmount)}
                  >
                    Max
                  </button>
                </div>

                {/* Slider */}
                <div className="co-slider-track">
                  <div className="co-slider-rail">
                    <div className="co-slider-fill" style={{ width: `${sliderPercent}%` }} />
                  </div>
                  <div className="co-slider-thumb" style={{ left: `${sliderPercent}%` }} />
                  <input
                    type="range"
                    className="co-slider-input"
                    min={Math.round(minPayout * 100)}
                    max={Math.round(cashableAmount * 100)}
                    step={100}
                    value={Math.round(payoutAmount * 100)}
                    onChange={(e) => setPayoutAmount(parseInt(e.target.value) / 100)}
                  />
                </div>

                {/* Breakdown */}
                <div className="co-breakdown">
                  <div className="co-breakdown-row">
                    <span className="co-breakdown-label">Payout amount</span>
                    <span className="co-breakdown-value">${payoutAmount.toFixed(2)}</span>
                  </div>
                  {currentFee > 0 && (
                    <div className="co-breakdown-row">
                      <span className="co-breakdown-label">Instant fee ({isHmuFirst ? 'waived' : '$1 or 1%'})</span>
                      <span className="co-breakdown-value co-breakdown-value--yellow">-${currentFee.toFixed(2)}</span>
                    </div>
                  )}
                  <hr className="co-breakdown-divider" />
                  <div className="co-breakdown-row">
                    <span className="co-breakdown-label co-breakdown-total">You receive</span>
                    <span className="co-breakdown-value co-breakdown-value--green co-breakdown-total">
                      ${driverReceives.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="co-btn co-btn--green"
              onClick={handleCashout}
              disabled={cashingOut || cashableAmount <= 0 || payoutAmount < minPayout}
            >
              {cashingOut
                ? 'Processing...'
                : cashableAmount > 0
                  ? `Cash Out $${driverReceives.toFixed(2)}`
                  : 'No balance yet — complete a ride'}
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
