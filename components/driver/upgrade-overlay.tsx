'use client';

import { useState, useCallback } from 'react';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface Props {
  open: boolean;
  onClose: () => void;
  onUpgraded: () => void;
}

export default function UpgradeOverlay({ open, onClose, onUpgraded }: Props) {
  const [step, setStep] = useState<'info' | 'payment' | 'success'>('info');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isSetup, setIsSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confettiColors = ['#00E676', '#FFD600', '#FF4081', '#448AFF', '#E040FB', '#FF6E40'];
  const particles = step === 'success' ? Array.from({ length: 50 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 1.2,
    color: confettiColors[i % confettiColors.length],
    drift: (Math.random() - 0.5) * 100,
  })) : [];

  async function handleStartPayment() {
    fbEvent('InitiateCheckout', { value: 9.99, currency: 'USD', content_name: 'hmu_first_upgrade' });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/upgrade-inline', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }
      // If subscription is already active (e.g. $0 price or existing payment)
      if (data.alreadyActive) {
        handlePaymentSuccess();
        return;
      }
      if (!data.clientSecret) {
        setError('Could not initialize payment. Please try again.');
        setLoading(false);
        return;
      }
      setClientSecret(data.clientSecret);
      setIsSetup(true); // Always SetupIntent now
      setLoading(false);
      setStep('payment');
      return;
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  function handlePaymentSuccess() {
    fbEvent('Purchase', { value: 9.99, currency: 'USD', content_name: 'hmu_first_upgrade' });
    fbEvent('Subscribe', { value: 9.99, currency: 'USD', predicted_ltv: 119.88 });
    // Confirm upgrade server-side
    fetch('/api/driver/upgrade')
      .then(r => r.json())
      .then(() => {
        setStep('success');
        setTimeout(() => {
          onUpgraded();
          window.location.reload();
        }, 3000);
      })
      .catch(() => {
        setStep('success');
        setTimeout(() => window.location.reload(), 3000);
      });
  }

  if (!open && step !== 'success') return null;

  return (
    <>
      <style>{`
        .uo-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: flex-end; justify-content: center; }
        .uo-sheet { width: 100%; max-width: 420px; max-height: 90svh; background: #0a0a0a; border-radius: 24px 24px 0 0; padding: 28px 24px max(40px, env(safe-area-inset-bottom)); overflow-y: auto; position: relative; animation: uo-slideUp 0.3s ease-out; }
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
        .uo-success { position: fixed; inset: 0; z-index: 101; background: #080808; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
        @keyframes uo-badgeReveal { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 50% { transform: scale(1.2) rotate(5deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes uo-fadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes uo-confetti { 0% { transform: translateY(-10px) translateX(0) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; } }
        .uo-confetti-piece { position: absolute; top: 0; border-radius: 2px; pointer-events: none; }
      `}</style>

      {/* Success celebration */}
      {step === 'success' && (
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
            <div style={{ fontSize: '80px', marginBottom: '20px', animation: 'uo-badgeReveal 0.8s ease-out forwards' }}>
              {'\uD83E\uDD47'}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
              fontSize: '40px', color: '#fff', lineHeight: 1, marginBottom: '12px',
              animation: 'uo-fadeUp 0.5s ease-out 0.4s both',
            }}>
              WELCOME TO HMU FIRST
            </h1>
            <p style={{ fontSize: '15px', color: '#888', lineHeight: 1.5, animation: 'uo-fadeUp 0.5s ease-out 0.6s both' }}>
              Free instant payouts. Higher payouts. Priority placement.
            </p>
            <p style={{ fontSize: '13px', color: '#00E676', fontWeight: 600, animation: 'uo-fadeUp 0.5s ease-out 0.8s both' }}>
              Refreshing your profile...
            </p>
          </div>
        </div>
      )}

      {/* Info step */}
      {step === 'info' && open && (
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

            <button type="button" className="uo-btn uo-btn--primary" onClick={handleStartPayment} disabled={loading}>
              {loading ? 'Setting up...' : 'Upgrade Now — $9.99/mo'}
            </button>
            <button type="button" className="uo-btn uo-btn--ghost" onClick={onClose}>Not now</button>
            <div className="uo-guarantee">Secure payment via Stripe. Cancel anytime from settings.</div>
          </div>
        </div>
      )}

      {/* Payment step — inline Stripe Elements */}
      {step === 'payment' && clientSecret && (
        <div className="uo-overlay" onClick={() => { setStep('info'); }}>
          <div className="uo-sheet" onClick={e => e.stopPropagation()}>
            <div className="uo-handle" />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              Complete Payment
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              HMU First — $9.99/mo. Apple Pay, Google Pay, and cards accepted.
            </div>

            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#00E676',
                    colorBackground: '#141414',
                    colorText: '#ffffff',
                    colorDanger: '#FF5252',
                    borderRadius: '12px',
                    fontFamily: "'DM Sans', sans-serif",
                  },
                  rules: {
                    '.Input': { backgroundColor: '#1a1a1a', border: '1px solid rgba(0,230,118,0.3)', color: '#ffffff' },
                    '.Input:focus': { border: '1px solid #00E676', boxShadow: '0 0 0 1px #00E676' },
                    '.Label': { color: '#888888' },
                  },
                },
              }}
            >
              <SubscriptionPaymentForm onSuccess={handlePaymentSuccess} onBack={() => setStep('info')} isSetup={isSetup} />
            </Elements>
          </div>
        </div>
      )}
    </>
  );
}

function SubscriptionPaymentForm({ onSuccess, onBack, isSetup }: { onSuccess: () => void; onBack: () => void; isSetup?: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Validation failed');
      setSubmitting(false);
      return;
    }

    const { error: confirmError } = isSetup
      ? await stripe.confirmSetup({ elements, redirect: 'if_required' })
      : await stripe.confirmPayment({ elements, redirect: 'if_required' });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onSuccess();
  }, [stripe, elements, onSuccess, isSetup, submitting]);

  return (
    <div>
      {!ready && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#888', fontSize: 13 }}>
          Loading payment options...
        </div>
      )}
      <div style={{ display: ready ? 'block' : 'none' }}>
        <PaymentElement
          onReady={() => setReady(true)}
          options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }}
        />
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#FF5252', marginTop: 10, padding: '8px 12px', background: 'rgba(255,68,68,0.08)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSubmit}
          disabled={!stripe || !ready || submitting}
          style={{
            flex: 1, padding: 16, borderRadius: 100, border: 'none',
            background: '#00E676', color: '#080808', fontWeight: 700, fontSize: 16,
            cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.5 : 1,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          {submitting ? 'Processing...' : 'Pay $9.99/mo'}
        </button>
        <button
          onClick={onBack}
          style={{
            padding: '16px 20px', borderRadius: 100, border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          Back
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#555' }}>
        Secured by Stripe. Cancel anytime.
      </div>
    </div>
  );
}
