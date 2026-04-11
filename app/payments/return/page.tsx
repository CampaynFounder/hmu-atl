'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

function PaymentReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState('Saving your payment method…');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const clientSecret = params.get('setup_intent_client_secret');
    const next = params.get('next') || '/';

    if (!clientSecret) {
      router.replace(next);
      return;
    }

    (async () => {
      const stripe = await stripePromise;
      if (!stripe) {
        setIsError(true);
        setMessage('Stripe failed to load.');
        return;
      }

      const { setupIntent, error } = await stripe.retrieveSetupIntent(clientSecret);
      if (error || !setupIntent) {
        setIsError(true);
        setMessage(error?.message || 'Could not verify payment method.');
        return;
      }

      if (setupIntent.status === 'succeeded' && setupIntent.payment_method) {
        try {
          const res = await fetch('/api/payments/setup-intent-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setIsError(true);
            setMessage(data.error || 'Failed to save payment method.');
            return;
          }
        } catch {
          setIsError(true);
          setMessage('Network error while saving.');
          return;
        }
        router.replace(next + (next.includes('?') ? '&' : '?') + 'payment_saved=1');
      } else if (setupIntent.status === 'processing') {
        setMessage('Still processing — you can head back.');
        setTimeout(() => router.replace(next), 1500);
      } else {
        setIsError(true);
        setMessage('Payment method not saved. Please try again.');
      }
    })();
  }, [params, router]);

  return (
    <div style={{
      background: '#080808',
      color: '#fff',
      minHeight: '100svh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-body, DM Sans, sans-serif)',
      padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{isError ? '⚠️' : '🔄'}</div>
        <div style={{ fontSize: 15, color: isError ? '#FF5252' : '#bbb', marginBottom: 16 }}>
          {message}
        </div>
        {isError && (
          <button
            onClick={() => router.replace(params.get('next') || '/')}
            style={{
              padding: '12px 24px',
              borderRadius: 100,
              border: 'none',
              background: '#00E676',
              color: '#080808',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Go Back
          </button>
        )}
      </div>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReturnInner />
    </Suspense>
  );
}
