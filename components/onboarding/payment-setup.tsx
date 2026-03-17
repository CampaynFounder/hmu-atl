'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Lock, AlertCircle, Check, Plus, Banknote } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentSetupProps {
  onPaymentAdded: (stripeCustomerId: string) => void;
  existingStripeCustomerId?: string;
  variant?: 'payment' | 'payout';
}

export function PaymentSetup({ onPaymentAdded, existingStripeCustomerId, variant = 'payment' }: PaymentSetupProps) {
  return (
    <Elements stripe={stripePromise}>
      <PaymentSetupForm
        onPaymentAdded={onPaymentAdded}
        existingStripeCustomerId={existingStripeCustomerId}
        variant={variant}
      />
    </Elements>
  );
}

function PaymentSetupForm({ onPaymentAdded, existingStripeCustomerId, variant = 'payment' }: PaymentSetupProps) {
  const stripe = useStripe();
  const elements = useElements();

  const isPayout = variant === 'payout';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [existingCard, setExistingCard] = useState<{ brand: string; last4: string } | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<ReturnType<NonNullable<typeof stripe>['paymentRequest']> | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);

  useEffect(() => {
    if (existingStripeCustomerId) {
      fetchExistingPaymentMethod();
    }
  }, [existingStripeCustomerId]);

  // Set up Apple Pay / Google Pay
  useEffect(() => {
    if (!stripe || isPayout) return;

    const pr = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: {
        label: 'HMU ATL',
        amount: 0, // $0 — just saving the payment method
      },
      requestPayerName: true,
      requestPayerEmail: false,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        setPaymentRequest(pr);
        setWalletAvailable(true);
      }
    });

    pr.on('paymentmethod', async (ev) => {
      try {
        const res = await fetch('/api/payments/methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethodId: ev.paymentMethod.id }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          ev.complete('fail');
          setError(data.error || 'Failed to save payment method');
          return;
        }
        ev.complete('success');
        onPaymentAdded(data.customerId || data.stripeCustomerId);
      } catch {
        ev.complete('fail');
        setError('Something went wrong');
      }
    });
  }, [stripe, isPayout]);

  const fetchExistingPaymentMethod = async () => {
    try {
      const res = await fetch('/api/payments/methods');
      const data = await res.json();
      if (data.success && data.paymentMethods?.length > 0) {
        const card = data.paymentMethods[0];
        setExistingCard({ brand: card.brand, last4: card.last4 });
      }
    } catch (err) {
      console.error('Failed to fetch payment method:', err);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card element not found');

      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (stripeError) throw new Error(stripeError.message);
      if (!paymentMethod) throw new Error('Failed to create payment method');

      const res = await fetch('/api/payments/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId: paymentMethod.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save payment method');

      fetch('/api/users/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: isPayout ? 'payout_method_added' : 'payment_method_added',
          properties: { brand: paymentMethod.card?.brand, last4: paymentMethod.card?.last4 },
        }),
      }).catch(console.error);

      onPaymentAdded(data.customerId || data.stripeCustomerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (existingCard) {
    return (
      <div className="space-y-6">
        <div className={`rounded-xl border-2 p-6 ${isPayout ? 'border-[#00E676] bg-[#00E676]/10' : 'border-green-500 bg-green-50 dark:bg-green-950'}`}>
          <div className="flex items-start gap-4">
            <div className={`rounded-full p-2 ${isPayout ? 'bg-[#00E676]' : 'bg-green-500'}`}>
              <Check className={`h-6 w-6 ${isPayout ? 'text-black' : 'text-white'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CreditCard className={`h-5 w-5 ${isPayout ? 'text-[#00E676]' : 'text-green-700 dark:text-green-300'}`} />
                <span className={`font-semibold ${isPayout ? 'text-white' : 'text-green-900 dark:text-green-100'}`}>
                  {isPayout ? 'Payout method linked' : 'Payment method added'}
                </span>
              </div>
              <div className="mt-2">
                <span className={`text-sm ${isPayout ? 'text-zinc-300' : 'text-green-700 dark:text-green-300'}`}>
                  {existingCard.brand.toUpperCase()} ••••{existingCard.last4}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setExistingCard(null)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-4 font-medium transition-all ${
            isPayout
              ? 'border-zinc-700 text-zinc-400 hover:border-[#00E676] hover:text-[#00E676]'
              : 'border-gray-300 text-muted-foreground hover:border-purple-500 hover:text-purple-600 dark:border-zinc-700'
          }`}
        >
          <Plus className="h-5 w-5" />
          Use a different {isPayout ? 'account' : 'card'}
        </button>

        <SecurityNote isPayout={isPayout} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Banner */}
      <div className={`rounded-xl p-4 ${isPayout ? 'bg-[#00E676]/10 border border-[#00E676]/30' : 'bg-blue-50 dark:bg-blue-950'}`}>
        <div className="flex gap-3">
          {isPayout ? (
            <Banknote className="h-5 w-5 shrink-0 text-[#00E676] mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          )}
          <div className={`text-sm ${isPayout ? 'text-zinc-300' : 'text-blue-900 dark:text-blue-100'}`}>
            {isPayout ? (
              <>
                <strong className="text-white">Link your debit card or bank</strong>
                <p className="mt-1 text-zinc-400">
                  After each ride, your earnings are sent here. Cash App, Venmo, and bank transfers are always free.
                </p>
              </>
            ) : (
              <>
                <strong>No charge today</strong>
                <p className="mt-1 text-blue-700 dark:text-blue-300">
                  We'll only charge your card after you complete a ride. You can cancel anytime before a driver accepts.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Apple Pay / Google Pay (riders only) */}
      {!isPayout && walletAvailable && paymentRequest && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-center text-muted-foreground">
            Pay with wallet
          </label>
          <PaymentRequestButtonElement
            options={{
              paymentRequest,
              style: {
                paymentRequestButton: {
                  type: 'default',
                  theme: 'dark',
                  height: '52px',
                },
              },
            }}
          />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
            <span className="text-xs text-muted-foreground">or enter card</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
          </div>
        </div>
      )}

      {/* Card Input */}
      <div>
        <label className={`block text-sm font-medium mb-3 ${isPayout ? 'text-white' : ''}`}>
          <CreditCard className="inline h-4 w-4 mr-1" />
          {isPayout ? 'Debit Card' : 'Card Information'}
        </label>
        <div
          className={`rounded-xl border-2 px-4 py-4 transition-all ${
            error
              ? 'border-red-500'
              : cardComplete
              ? isPayout ? 'border-[#00E676]' : 'border-green-500'
              : isPayout
              ? 'border-zinc-700 focus-within:border-[#00E676]'
              : 'border-gray-300 focus-within:border-purple-500 dark:border-zinc-700'
          }`}
        >
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: isPayout ? '#ffffff' : '#1f2937',
                  '::placeholder': { color: '#6b7280' },
                },
                invalid: { color: '#ef4444' },
              },
              hidePostalCode: false,
            }}
            onChange={(e) => {
              setCardComplete(e.complete);
              setError(e.error ? e.error.message : null);
            }}
          />
        </div>
        {error && (
          <p className="mt-2 flex items-center gap-1 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!stripe || !cardComplete || loading}
        className={`w-full rounded-xl px-6 py-4 font-bold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${
          isPayout
            ? 'bg-[#00E676] text-black hover:shadow-[0_0_24px_rgba(0,230,118,0.3)]'
            : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-xl'
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <div className={`h-5 w-5 animate-spin rounded-full border-2 border-t-transparent ${isPayout ? 'border-black' : 'border-white'}`} />
            <span>{isPayout ? 'Linking...' : 'Saving card...'}</span>
          </div>
        ) : isPayout ? (
          'Link Payout Method'
        ) : (
          'Add Payment Method'
        )}
      </button>

      <SecurityNote isPayout={isPayout} />
    </form>
  );
}

function SecurityNote({ isPayout }: { isPayout: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${isPayout ? 'bg-zinc-800' : 'bg-gray-100 dark:bg-zinc-800'}`}>
      <div className="flex gap-3">
        <Lock className="h-5 w-5 shrink-0 text-green-500 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">
            {isPayout ? 'Your payout info is secure' : 'Your payment is secure'}
          </strong>
          <p className="mt-1">
            {isPayout
              ? 'We use Stripe for secure payout processing. Your account details are encrypted and never stored on our servers.'
              : 'We use Stripe for secure payment processing. Your card details are encrypted and never stored on our servers.'}
          </p>
        </div>
      </div>
    </div>
  );
}
