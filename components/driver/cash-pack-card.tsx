'use client';

import { useState, useEffect, useCallback } from 'react';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface CashBalance {
  freeRemaining: number;
  packBalance: number;
  total: number;
  unlimited: boolean;
}

export default function CashPackCard() {
  const [balance, setBalance] = useState<CashBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentSetup, setPaymentSetup] = useState<{ clientSecret: string; pack: string } | null>(null);

  useEffect(() => {
    fetch('/api/driver/cash-packs')
      .then(r => r.json())
      .then(data => { if (!data.error) setBalance(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handlePurchase(pack: '10' | '25') {
    const value = pack === '10' ? 4.99 : 9.99;
    fbEvent('InitiateCheckout', { value, currency: 'USD', content_name: `cash_pack_${pack}` });
    setPurchasing(pack);
    setError(null);
    try {
      const res = await fetch('/api/driver/cash-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json();

      if (data.success) {
        fbEvent('Purchase', { value, currency: 'USD', content_name: `cash_pack_${pack}` });
        setSuccess(`+${pack === '10' ? 10 : 25} cash rides added!`);
        const balRes = await fetch('/api/driver/cash-packs');
        if (balRes.ok) setBalance(await balRes.json());
        setTimeout(() => setSuccess(null), 3000);
      } else if (data.clientSecret) {
        // No payment method — show inline Stripe form
        setPaymentSetup({ clientSecret: data.clientSecret, pack: data.pack || pack });
      } else {
        setError(data.error || 'Purchase failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setPurchasing(null);
    }
  }

  async function handlePaymentSuccess(paymentMethodId: string) {
    if (!paymentSetup) return;
    fbCustomEvent('PaymentMethodAdded', { source: 'cash_pack', pack: paymentSetup.pack });
    setPurchasing(paymentSetup.pack);
    setPaymentSetup(null);
    setError(null);

    try {
      const res = await fetch('/api/driver/cash-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack: paymentSetup.pack, paymentMethodId }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`+${paymentSetup.pack === '10' ? 10 : 25} cash rides added!`);
        const balRes = await fetch('/api/driver/cash-packs');
        if (balRes.ok) setBalance(await balRes.json());
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Purchase failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setPurchasing(null);
    }
  }

  if (loading || !balance) return null;
  if (balance.unlimited) return null;

  // Show inline Stripe payment form
  if (paymentSetup) {
    return (
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '20px', marginBottom: 16,
      }}>
        <div style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 10, color: '#888', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10,
        }}>
          Add Payment Method
        </div>
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 16, lineHeight: 1.4 }}>
          Link a card to purchase your cash pack. Apple Pay, Google Pay, and cards accepted.
        </div>
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: paymentSetup.clientSecret,
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
                '.Input': {
                  backgroundColor: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ffffff',
                },
                '.Input:focus': {
                  border: '1px solid #00E676',
                  boxShadow: '0 0 0 1px #00E676',
                },
                '.Label': { color: '#888888' },
              },
            },
          }}
        >
          <CashPackPaymentInner
            onSuccess={handlePaymentSuccess}
            onCancel={() => setPaymentSetup(null)}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div style={{
      background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20, padding: '20px', marginBottom: 16,
    }}>
      <div style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 10, color: '#888', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10,
      }}>
        Cash Rides
      </div>

      {/* Balance display */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 36, color: balance.total > 0 ? '#4CAF50' : '#FF5252', lineHeight: 1,
        }}>
          {balance.total}
        </span>
        <span style={{ fontSize: 13, color: '#888' }}>
          rides remaining
        </span>
      </div>

      <div style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>
        {balance.freeRemaining > 0 && `${balance.freeRemaining} free (resets monthly)`}
        {balance.freeRemaining > 0 && balance.packBalance > 0 && ' + '}
        {balance.packBalance > 0 && `${balance.packBalance} from packs`}
      </div>

      {success && (
        <div style={{
          fontSize: 13, color: '#4CAF50', fontWeight: 600,
          padding: '8px 12px', background: 'rgba(76,175,80,0.08)',
          borderRadius: 10, marginBottom: 12, textAlign: 'center',
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          fontSize: 12, color: '#FF5252',
          padding: '8px 12px', background: 'rgba(255,68,68,0.08)',
          borderRadius: 10, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Purchase packs */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => handlePurchase('10')}
          disabled={!!purchasing}
          style={{
            flex: 1, padding: '14px 8px', borderRadius: 14,
            border: '1px solid rgba(76,175,80,0.3)', background: 'rgba(76,175,80,0.06)',
            cursor: purchasing ? 'not-allowed' : 'pointer',
            opacity: purchasing === '25' ? 0.5 : 1,
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 20, color: '#4CAF50' }}>
            10 Rides
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>$4.99</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>$0.50 / ride</div>
        </button>
        <button
          onClick={() => handlePurchase('25')}
          disabled={!!purchasing}
          style={{
            flex: 1, padding: '14px 8px', borderRadius: 14,
            border: '2px solid rgba(76,175,80,0.5)', background: 'rgba(76,175,80,0.1)',
            cursor: purchasing ? 'not-allowed' : 'pointer',
            opacity: purchasing === '10' ? 0.5 : 1,
            textAlign: 'center', position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: -8, right: 10,
            background: '#4CAF50', color: '#000', fontSize: 9, fontWeight: 800,
            padding: '2px 8px', borderRadius: 100, letterSpacing: 1,
          }}>
            BEST VALUE
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 20, color: '#4CAF50' }}>
            25 Rides
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>$9.99</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>$0.40 / ride</div>
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#555', textAlign: 'center', marginTop: 10 }}>
        Packs never expire. HMU First gets unlimited cash rides.
      </div>
    </div>
  );
}

function CashPackPaymentInner({
  onSuccess,
  onCancel,
}: {
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Validation failed');
      setSubmitting(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Failed to save payment method');
      setSubmitting(false);
      return;
    }

    if (setupIntent?.payment_method) {
      // Also save to driver's profile for future purchases
      try {
        await fetch('/api/driver/payment-methods/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
        });
      } catch {
        // Non-critical — continue with purchase
      }

      setSubmitting(false);
      onSuccess(setupIntent.payment_method as string);
    } else {
      setError('Payment setup incomplete');
      setSubmitting(false);
    }
  }, [stripe, elements, onSuccess]);

  return (
    <div>
      <PaymentElement
        options={{
          layout: 'tabs',
          wallets: { applePay: 'auto', googlePay: 'auto' },
        }}
      />

      {error && (
        <div style={{
          fontSize: 12, color: '#FF5252', marginTop: 10,
          padding: '8px 12px', background: 'rgba(255,68,68,0.08)', borderRadius: 8,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSubmit}
          disabled={!stripe || submitting}
          style={{
            flex: 1, padding: 14, borderRadius: 100, border: 'none',
            background: '#00E676', color: '#080808', fontWeight: 700,
            fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.5 : 1,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          {submitting ? 'Processing...' : 'Add Card & Purchase'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '14px 20px', borderRadius: 100,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          Cancel
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 12,
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: 11, color: '#555' }}>Secured by Stripe</span>
      </div>
    </div>
  );
}
