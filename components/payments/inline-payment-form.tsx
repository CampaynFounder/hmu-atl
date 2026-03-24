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
  onCancel?: () => void;
  compact?: boolean;
}

/**
 * Inline Stripe Payment Element for adding a payment method.
 * Uses SetupIntent (no charge) — supports Apple Pay, Google Pay, cards, Cash App Pay.
 * No redirect to Stripe — everything stays in-app.
 */
export default function InlinePaymentForm({ onSuccess, onCancel, compact }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/rider/payment-methods/setup-intent', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          setError(data.error || 'Failed to initialize payment');
        }
      })
      .catch(() => setError('Network error'));
  }, []);

  if (error) {
    return (
      <div style={{
        padding: compact ? 16 : 20,
        background: '#141414',
        borderRadius: 16,
        border: '1px solid rgba(255,82,82,0.2)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#FF5252', marginBottom: 8 }}>{error}</div>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 100, padding: '8px 20px', color: '#888',
              fontSize: 13, cursor: 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Close
          </button>
        )}
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div style={{
        padding: compact ? 16 : 24,
        background: '#141414',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
        color: '#888',
        fontSize: 13,
      }}>
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
            '.Input': {
              backgroundColor: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#ffffff',
            },
            '.Input:focus': {
              border: '1px solid #00E676',
              boxShadow: '0 0 0 1px #00E676',
            },
            '.Label': {
              color: '#888888',
            },
          },
        },
      }}
    >
      <PaymentFormInner onSuccess={onSuccess} onCancel={onCancel} compact={compact} />
    </Elements>
  );
}

function PaymentFormInner({
  onSuccess,
  onCancel,
  compact,
}: {
  onSuccess: () => void;
  onCancel?: () => void;
  compact?: boolean;
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
      // Save the payment method to our DB
      try {
        const res = await fetch('/api/rider/payment-methods/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to save');
          setSubmitting(false);
          return;
        }
      } catch {
        setError('Failed to save payment method');
        setSubmitting(false);
        return;
      }
    }

    fbCustomEvent('PaymentMethodAdded', { source: 'rider_inline' });
    fbEvent('AddPaymentInfo', { content_name: 'rider_payment_method' });
    setSubmitting(false);
    onSuccess();
  }, [stripe, elements, onSuccess]);

  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: compact ? 16 : 20,
    }}>
      {!compact && (
        <div style={{
          fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#fff',
        }}>
          Link Payment Method
        </div>
      )}
      {!compact && (
        <div style={{
          fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.4,
        }}>
          Apple Pay, Google Pay, Cash App Pay, and cards accepted. No charge — your card is only charged when a ride completes.
        </div>
      )}

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
          {submitting ? 'Saving...' : 'Save Payment Method'}
        </button>
        {onCancel && (
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
        )}
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
