'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { fbCustomEvent } from '@/components/analytics/meta-pixel';
import { CountUp } from '@/components/shared/count-up';
import UpgradeOverlay from './upgrade-overlay';

interface BalanceData {
  available: number;
  pending: number;
  instantAvailable: number;
  instantEligible: boolean;
  tier: string;
  cashEarnings?: { rides: number; total: number };
  digitalEarnings?: { rides: number; total: number };
  noShowEarnings?: { rides: number; total: number };
}

export default function CashoutCard() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [result, setResult] = useState<{ amount: number; method: string; fee: number; arrival: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'standard' | 'instant'>('standard');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<number>(0);

  const loadBalance = useCallback(async () => {
    try {
      const r = await fetch('/api/driver/balance', { cache: 'no-store' });
      const data = await r.json();
      if (!data.error) setBalance(data);
    } catch {
      // swallow — UI keeps last-known balance
    }
  }, []);

  useEffect(() => {
    loadBalance().finally(() => setLoading(false));
  }, [loadBalance]);

  // Belt-and-suspenders: refetch when the tab becomes visible again so a
  // driver returning from Stripe/their bank sees current numbers without
  // a hard reload. Cheap — one Stripe balance call per foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadBalance();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadBalance]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    await loadBalance();
    setRefreshing(false);
  }

  const isHmuFirst = balance?.tier === 'hmu_first';

  // Cashable depends on which payout method the driver is looking at:
  //   Standard = fully settled funds (balance.available)
  //   Instant  = funds Stripe has fronted for instant payout (balance.instantAvailable)
  // For eligible accounts these diverge — instantAvailable can be > 0 while
  // available is still $0 during the normal settlement window. We were
  // previously hiding that from the driver, which looked like "funds stuck
  // in pending" even though Stripe would pay them out instantly.
  const cashableAmount = balance
    ? (selectedMethod === 'instant' ? balance.instantAvailable : balance.available)
    : 0;

  // Track whether the driver has manually picked a method. Once they have,
  // we NEVER auto-override their choice — even if switching to Standard
  // zeroes out cashableAmount. Previously this flag didn't exist, so the
  // auto-default effect would flip Instant back on every time the user
  // picked Standard (because Standard's cashable of $0 triggered the
  // "only Instant has funds" branch), making the toggle appear stuck.
  const userHasPickedMethodRef = useRef(false);

  // On first balance load only, pick the right default method AND seed
  // the slider at the minimum. Driver slides UP to their desired amount
  // rather than down from max — lower-commitment UX, still one tap on
  // the Max button to grab everything.
  useEffect(() => {
    if (!balance || payoutAmount !== 0 || userHasPickedMethodRef.current) return;
    if (balance.available > 0) {
      setSelectedMethod('standard');
      setPayoutAmount(Math.min(balance.available, 1));
    } else if (balance.instantAvailable > 0) {
      setSelectedMethod('instant');
      const floor = isHmuFirst ? 1 : 2;
      setPayoutAmount(Math.min(balance.instantAvailable, floor));
    }
  }, [balance, payoutAmount, isHmuFirst]);

  // Clamp payoutAmount down if the balance shrinks (e.g. after a cashout).
  useEffect(() => {
    if (payoutAmount > cashableAmount) setPayoutAmount(cashableAmount);
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
    // Mark user intent FIRST so the auto-default effect above can't race us
    // and flip the method back on the next render.
    userHasPickedMethodRef.current = true;
    setSelectedMethod(method);
    // Reset to the target method's minimum — driver slides UP from here.
    // cashableAmount/minPayout above are still derived from the pre-change
    // selectedMethod, so compute fresh values inline.
    const newCashable = method === 'instant'
      ? (balance?.instantAvailable ?? 0)
      : (balance?.available ?? 0);
    const floor = (method === 'instant' && !isHmuFirst) ? 2 : 1;
    setPayoutAmount(Math.min(newCashable, floor));
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
      setTimeout(() => setShowConfetti(false), 4000);
      await loadBalance();
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
        /* Segmented toggle — compact iOS-style two-option picker for
           Standard / Instant. Active segment gets the green pill; inactive
           is transparent. Active method details show in co-seg-detail. */
        .co-seg {
          display: flex; gap: 4px;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 100px;
          padding: 4px;
          margin-bottom: 8px;
        }
        .co-seg-btn {
          flex: 1; padding: 10px 16px;
          border: none; background: transparent;
          color: #888;
          font-size: 14px; font-weight: 600; line-height: 1;
          font-family: var(--font-body, 'DM Sans', sans-serif);
          cursor: pointer; border-radius: 100px;
          transition: background 0.2s, color 0.2s, transform 0.15s;
        }
        .co-seg-btn:active:not(:disabled) { transform: scale(0.97); }
        .co-seg-btn--active {
          background: #00E676; color: #080808;
          box-shadow: 0 2px 10px rgba(0,230,118,0.25);
        }
        .co-seg-detail {
          text-align: center; font-size: 12px; color: #888;
          margin-bottom: 16px; min-height: 16px;
          font-family: var(--font-body, 'DM Sans', sans-serif);
        }
        .co-seg-detail--fee { color: #FFB300; }
        .co-seg-detail--perk { color: #00E676; }
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
        /* Native range input styled directly — no overlay/opacity tricks.
           iOS Safari was dropping touch events on the previous invisible-
           overlay pattern. Restyling the actual <input type=range> via
           pseudo-elements keeps native gesture handling while matching
           the custom visual design exactly. */
        .co-slider-track { position: relative; width: 100%; padding: 10px 0; }
        .co-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 28px;
          background: transparent;
          cursor: pointer;
          margin: 0;
          padding: 0;
          touch-action: manipulation;
          display: block;
        }
        .co-slider:focus { outline: none; }
        /* WebKit (iOS Safari, Chrome, Edge) — track is a gradient so the
           "fill" color is encoded in the track itself. The --fill custom
           property drives how much of the track is green. */
        .co-slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, #00E676 0%, #00E676 var(--fill, 0%), #222 var(--fill, 0%), #222 100%);
          border: none;
        }
        .co-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          background: #00E676;
          border: 3px solid #080808;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,230,118,0.3);
          cursor: pointer;
          margin-top: -11px;
        }
        /* Firefox — uses separate track/progress/thumb pseudos. */
        .co-slider::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: #222;
          border: none;
        }
        .co-slider::-moz-range-progress {
          height: 6px;
          border-radius: 3px;
          background: #00E676;
        }
        .co-slider::-moz-range-thumb {
          width: 28px;
          height: 28px;
          background: #00E676;
          border: 3px solid #080808;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,230,118,0.3);
          cursor: pointer;
        }
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

        /* First-load shimmer on the primary cashout button. Sweeps twice then
           stops — cue to tap without being obnoxious. */
        .co-shimmer { position: relative; overflow: hidden; }
        .co-shimmer::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: coShimmer 1.6s ease-out 2;
          pointer-events: none;
        }
        @keyframes coShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Micro text entrance for the headline amount. */
        @keyframes coTextRise {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .co-rise { animation: coTextRise 0.5s cubic-bezier(0.25, 0.1, 0.25, 1) both; }
        .co-rise-1 { animation-delay: 0.05s; }
        .co-rise-2 { animation-delay: 0.12s; }
        .co-rise-3 { animation-delay: 0.2s; }

        /* Refresh pill — prominent affordance to re-pull Stripe balance
           without reloading the page. Brand green, always-on. */
        .co-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
        .co-refresh {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 100px;
          background: rgba(0,230,118,0.08);
          border: 1px solid rgba(0,230,118,0.3);
          color: #00E676;
          font-size: 12px; font-weight: 700;
          font-family: var(--font-body, 'DM Sans', sans-serif);
          letter-spacing: 0.5px;
          cursor: pointer; flex-shrink: 0; line-height: 1;
          transition: background 0.15s, border-color 0.15s, transform 0.15s;
        }
        .co-refresh:hover:not(:disabled) {
          background: rgba(0,230,118,0.14);
          border-color: rgba(0,230,118,0.5);
        }
        .co-refresh:active:not(:disabled) { transform: scale(0.96); }
        .co-refresh:disabled { cursor: not-allowed; opacity: 0.7; }
        .co-refresh-icon { display: inline-block; font-size: 14px; }
        .co-refresh--spinning .co-refresh-icon { animation: coSpin 0.8s linear infinite; }
        @keyframes coSpin { to { transform: rotate(360deg); } }
      `}</style>

      <motion.div
        className="co-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      >
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

        <div className="co-title-row co-rise co-rise-1">
          <div className="co-title" style={{ marginBottom: 0 }}>Ready to Cash Out</div>
          <button
            type="button"
            className={`co-refresh ${refreshing ? 'co-refresh--spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh balance"
            title="Re-check Stripe for newly available funds"
          >
            <span className="co-refresh-icon">{'↻'}</span>
            <span>{refreshing ? 'Checking…' : 'Refresh'}</span>
          </button>
        </div>
        <div className={`co-amount co-rise co-rise-2 ${cashableAmount <= 0 ? 'co-amount--zero' : ''}`}>
          <CountUp value={cashableAmount} decimals={2} prefix="$" duration={800} animateOnChange />
        </div>
        {/* Pending line shows what's NOT yet in the selected method's bucket.
            Big number above is what's cashable right now; this line is "what's
            still coming that you can't touch yet". Hidden when 0 so we don't
            clutter the card with redundant info. */}
        {(() => {
          const stillComing = selectedMethod === 'instant'
            ? Math.max(0, balance.pending - (balance.instantAvailable || 0))
            : balance.pending;
          if (stillComing <= 0) return null;
          return (
            <div style={{ fontSize: 12, color: '#FFB300', marginBottom: 4, marginTop: -2 }}>
              {'+ '}<CountUp value={stillComing} decimals={2} prefix="$" duration={800} animateOnChange /> pending from Stripe
            </div>
          );
        })()}

        {/* Earnings breakdown — cash, deposits, and no-show income */}
        {(balance.cashEarnings || balance.digitalEarnings || balance.noShowEarnings) && (
          <>
            <div style={{
              display: 'flex', gap: 8,
              marginBottom: (balance.noShowEarnings && balance.noShowEarnings.total > 0) ? 8 : 12,
              marginTop: 4,
            }}>
              {balance.cashEarnings && balance.cashEarnings.rides > 0 && (
                <div style={{
                  flex: 1, background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.15)',
                  borderRadius: 12, padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 10, color: '#FFC107', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                    Your Cash
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#FFC107', fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}>
                    <CountUp value={balance.cashEarnings.total} decimals={2} prefix="$" duration={900} animateOnChange />
                  </div>
                  <div style={{ fontSize: 10, color: '#888' }}>{balance.cashEarnings.rides} ride{balance.cashEarnings.rides !== 1 ? 's' : ''}</div>
                </div>
              )}
              {balance.digitalEarnings && balance.digitalEarnings.rides > 0 && (
                <div style={{
                  flex: 1, background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.12)',
                  borderRadius: 12, padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 10, color: '#00E676', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                    Your Deposits
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#00E676', fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}>
                    <CountUp value={balance.digitalEarnings.total} decimals={2} prefix="$" duration={900} animateOnChange />
                  </div>
                  <div style={{ fontSize: 10, color: '#888' }}>{balance.digitalEarnings.rides} ride{balance.digitalEarnings.rides !== 1 ? 's' : ''}</div>
                </div>
              )}
            </div>

            {balance.noShowEarnings && (
              <div style={{
                background: 'rgba(255,64,129,0.06)', border: '1px solid rgba(255,64,129,0.18)',
                borderRadius: 12, padding: '10px 14px', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#FF4081', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                    {balance.noShowEarnings.total > 0 ? 'Your No-Show Income' : 'No-Show Protection'}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                    {balance.noShowEarnings.total > 0
                      ? `${balance.noShowEarnings.rides} no-show${balance.noShowEarnings.rides !== 1 ? 's' : ''} — collected, no ride given`
                      : 'You get paid when riders ghost'}
                  </div>
                </div>
                {balance.noShowEarnings.total > 0 ? (
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#FF4081', fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", whiteSpace: 'nowrap' }}>
                    <CountUp value={balance.noShowEarnings.total} decimals={2} prefix="$" duration={900} animateOnChange />
                  </div>
                ) : (
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: '#FF4081',
                    padding: '5px 10px', borderRadius: 100,
                    background: 'rgba(255,64,129,0.1)',
                    border: '1px solid rgba(255,64,129,0.3)',
                    letterSpacing: 1, textTransform: 'uppercase',
                    fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {'●'} Active
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {/* ── Payment education ── Single adaptive card, collapsed by default
            so it doesn't push the cash-out CTA below the fold. Title, icon,
            color, and bullet list all switch based on balance state. */}
        {(() => {
          const hasPending = balance.pending > 0;
          const hasAvailable = balance.available > 0;
          const hasCashable = cashableAmount > 0;

          // Nothing earned yet
          if (!hasPending && !hasCashable) {
            return (
              <PaymentInfoCard
                title="How Payouts Work"
                icon="&#x26A1;"
                color="#00E676"
                items={[
                  'Complete a digital (non-cash) ride to start building your payout history',
                  'New accounts: Stripe verifies your identity over the first ~7 days',
                  'After 30 days of activity, most drivers qualify for same-day payouts',
                  'Your earnings are 100% guaranteed — holds are only for fraud prevention',
                ]}
              />
            );
          }

          // Money present in both Instant and Standard — nothing to explain
          if (hasAvailable && hasCashable) return null;

          // Cashable via Instant but still settling for Standard — "speed up"
          if (hasCashable && !hasAvailable && hasPending) {
            return (
              <PaymentInfoCard
                title="Speed Up Your Payouts"
                icon="&#x1F680;"
                color="#448AFF"
                items={[
                  `$${balance.pending.toFixed(2)} is settling with Stripe — nobody took your money`,
                  'Instant payout is available now — Standard follows in 1-2 days',
                  'Drivers with 10+ rides get faster fund settlement',
                  'HMU First members get free instant payouts once eligible',
                ]}
              />
            );
          }

          // Pending but nothing cashable yet — "where's my money?"
          return (
            <PaymentInfoCard
              title="Where&apos;s My Money?"
              icon="&#x23F3;"
              color="#FFB300"
              items={[
                'Your money is safe — Stripe holds funds briefly to verify new accounts',
                'First payout: usually 2-7 days while Stripe confirms your identity',
                'After that: funds settle in 1-2 days (same-day with Instant payout)',
                'More rides = faster verification. Stripe prioritizes active drivers',
              ]}
            />
          );
        })()}

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
            {/* Segmented method picker */}
            <div className="co-seg" role="tablist" aria-label="Payout method">
              <button
                type="button" role="tab"
                aria-selected={selectedMethod === 'standard'}
                className={`co-seg-btn ${selectedMethod === 'standard' ? 'co-seg-btn--active' : ''}`}
                onClick={() => handleMethodSelect('standard')}
              >
                Standard
              </button>
              <button
                type="button" role="tab"
                aria-selected={selectedMethod === 'instant'}
                className={`co-seg-btn ${selectedMethod === 'instant' ? 'co-seg-btn--active' : ''}`}
                onClick={() => handleMethodSelect('instant')}
              >
                Instant {'⚡'}
              </button>
            </div>
            <div className={`co-seg-detail ${
              selectedMethod === 'instant' && !isHmuFirst ? 'co-seg-detail--fee' : 'co-seg-detail--perk'
            }`}>
              {selectedMethod === 'standard'
                ? '1–2 business days · FREE'
                : isHmuFirst
                  ? `Arrives in minutes · FREE ${'🥇'}`
                  : 'Arrives in minutes · $1 or 1%'}
            </div>

            {/* Amount Slider — shows after selecting a method */}
            {cashableAmount > 0 && (
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

                {/* Slider — native range input, styled via ::-webkit-* and
                    ::-moz-range-* pseudos. --fill drives the WebKit track
                    gradient; Firefox uses ::-moz-range-progress automatically. */}
                <div className="co-slider-track">
                  <input
                    type="range"
                    className="co-slider"
                    min={Math.round(minPayout * 100)}
                    max={Math.round(cashableAmount * 100)}
                    step={1}
                    value={Math.round(payoutAmount * 100)}
                    onChange={(e) => setPayoutAmount(parseInt(e.target.value) / 100)}
                    onInput={(e) => setPayoutAmount(parseInt((e.target as HTMLInputElement).value) / 100)}
                    aria-label="Payout amount"
                    // @ts-expect-error CSS custom property for track fill
                    style={{ '--fill': `${sliderPercent}%` }}
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
              className="co-btn co-btn--green co-shimmer"
              onClick={handleCashout}
              disabled={cashingOut || cashableAmount <= 0 || payoutAmount < minPayout}
            >
              {cashingOut
                ? 'Processing...'
                : cashableAmount > 0
                  ? `Cash Out $${driverReceives.toFixed(2)}`
                  : (selectedMethod === 'standard' && balance.instantAvailable > 0)
                    ? 'Funds still settling — switch to Instant below'
                    : 'No balance yet — complete a ride'}
            </button>

            {/* Nudge to Instant when Standard has $0 but funds are fronted
                for instant payout. Clickable so the driver switches in one tap. */}
            {cashableAmount <= 0 && selectedMethod === 'standard' && balance.instantAvailable > 0 && (
              <button
                type="button"
                onClick={() => handleMethodSelect('instant')}
                style={{
                  width: '100%', marginTop: 10, padding: '12px 14px',
                  background: 'rgba(0,230,118,0.08)',
                  border: '1px solid rgba(0,230,118,0.25)',
                  borderRadius: 12, cursor: 'pointer',
                  color: '#00E676', fontSize: 13, fontWeight: 700,
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>{'⚡'}</span>
                <span>Cash out ${balance.instantAvailable.toFixed(2)} instantly{isHmuFirst ? ' · free' : ''}</span>
              </button>
            )}

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
      </motion.div>
    </>
  );
}

/** Expandable payment education card */
function PaymentInfoCard({ title, icon, color, items }: {
  title: string;
  icon: string;
  color: string;
  items: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: `${color}08`,
      border: `1px solid ${color}20`,
      borderRadius: 14,
      marginBottom: 16,
      marginTop: 4,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: icon }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <span style={{
          fontSize: 12, color: color, fontWeight: 600,
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'none',
        }}>
          ▾
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              marginBottom: i < items.length - 1 ? 8 : 0,
            }}>
              <span style={{ color, fontSize: 8, marginTop: 5, flexShrink: 0 }}>●</span>
              <span style={{ fontSize: 12, color: '#bbb', lineHeight: 1.5, fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
