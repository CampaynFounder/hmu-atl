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

interface Props {
  onSuccess: () => void;
}

/**
 * Inline payment form for drivers — saves payment method for HMU First + Cash Packs.
 * Uses driver-specific setup-intent endpoint.
 */
export default function DriverPaymentForm({ onSuccess }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/driver/payment-setup', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.clientSecret) setClientSecret(data.clientSecret);
        else setError(data.error || 'Failed to initialize');
      })
      .catch(() => setError('Network error'));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: '#FF5252', background: 'rgba(255,68,68,0.08)', borderRadius: 12 }}>
        {error}
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>
        Setting up secure payment...
      </div>
    );
  }

  return (
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
      <DriverPaymentInner onSuccess={onSuccess} />
    </Elements>
  );
}

function DriverPaymentInner({ onSuccess }: { onSuccess: () => void }) {
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
    if (submitError) { setError(submitError.message || 'Validation failed'); setSubmitting(false); return; }

    const { error: confirmError } = await stripe.confirmSetup({ elements, redirect: 'if_required' });
    if (confirmError) { setError(confirmError.message || 'Failed'); setSubmitting(false); return; }

    fbCustomEvent('PaymentMethodAdded', { source: 'driver_profile' });
    fbEvent('AddPaymentInfo', { content_name: 'driver_payment_method' });
    setSubmitting(false);
    onSuccess();
  }, [stripe, elements, onSuccess, submitting]);

  return (
    <div>
      {!ready && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontSize: 13 }}>
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

      <button
        onClick={handleSubmit}
        disabled={!stripe || !ready || submitting}
        style={{
          width: '100%', padding: 14, borderRadius: 100, border: 'none', marginTop: 16,
          background: '#00E676', color: '#080808', fontWeight: 700, fontSize: 15,
          cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.5 : 1,
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}
      >
        {submitting ? 'Saving...' : 'Save Payment Method'}
      </button>

      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#555' }}>
        For HMU First subscription and Cash Pack purchases. Secured by Stripe.
      </div>
    </div>
  );
}
