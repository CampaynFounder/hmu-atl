'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Lock, AlertCircle, Check, Plus } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentSetupProps {
  onPaymentAdded: (stripeCustomerId: string) => void;
  existingStripeCustomerId?: string;
}

export function PaymentSetup({ onPaymentAdded, existingStripeCustomerId }: PaymentSetupProps) {
  return (
    <Elements stripe={stripePromise}>
      <PaymentSetupForm
        onPaymentAdded={onPaymentAdded}
        existingStripeCustomerId={existingStripeCustomerId}
      />
    </Elements>
  );
}

function PaymentSetupForm({ onPaymentAdded, existingStripeCustomerId }: PaymentSetupProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [existingCard, setExistingCard] = useState<{
    brand: string;
    last4: string;
  } | null>(null);

  // Fetch existing payment method if provided
  useEffect(() => {
    if (existingStripeCustomerId) {
      fetchExistingPaymentMethod();
    }
  }, [existingStripeCustomerId]);

  const fetchExistingPaymentMethod = async () => {
    try {
      const res = await fetch('/api/payments/methods');
      const data = await res.json();
      if (data.success && data.paymentMethods.length > 0) {
        const card = data.paymentMethods[0];
        setExistingCard({
          brand: card.brand,
          last4: card.last4,
        });
      }
    } catch (err) {
      console.error('Failed to fetch payment method:', err);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get card element
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Create payment method
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (!paymentMethod) {
        throw new Error('Failed to create payment method');
      }

      // Save payment method to backend
      const res = await fetch('/api/payments/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save payment method');
      }

      // Track payment method added
      await fetch('/api/users/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment_method_added',
          properties: {
            brand: paymentMethod.card?.brand,
            last4: paymentMethod.card?.last4,
          },
        }),
      }).catch(console.error); // Don't fail if analytics fails

      // Pass the Stripe customer ID to the parent
      onPaymentAdded(data.customerId || data.stripeCustomerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // If already has payment method, show confirmation
  if (existingCard) {
    return (
      <div className="space-y-6">
        {/* Existing Card Display */}
        <div className="rounded-xl border-2 border-green-500 bg-green-50 p-6 dark:bg-green-950">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-green-500 p-2">
              <Check className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-green-700 dark:text-green-300" />
                <span className="font-semibold text-green-900 dark:text-green-100">
                  Payment method added
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-green-700 dark:text-green-300">
                  {existingCard.brand.toUpperCase()} ••••{existingCard.last4}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Add Another Card Button */}
        <button
          onClick={() => setExistingCard(null)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-6 py-4 font-medium text-muted-foreground transition-all hover:border-purple-500 hover:text-purple-600 dark:border-zinc-700"
        >
          <Plus className="h-5 w-5" />
          Add a different card
        </button>

        {/* Security Note */}
        <SecurityNote />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Banner */}
      <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-950">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <strong>No charge today</strong>
            <p className="mt-1 text-blue-700 dark:text-blue-300">
              We'll only charge your card after you complete a ride. You can cancel anytime before
              a driver accepts.
            </p>
          </div>
        </div>
      </div>

      {/* Card Input */}
      <div>
        <label className="block text-sm font-medium mb-3">
          <CreditCard className="inline h-4 w-4 mr-1" />
          Card Information
        </label>
        <div
          className={`rounded-xl border-2 px-4 py-4 transition-all ${
            error
              ? 'border-red-500'
              : cardComplete
              ? 'border-green-500'
              : 'border-gray-300 focus-within:border-purple-500 dark:border-zinc-700'
          }`}
        >
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#1f2937',
                  '::placeholder': {
                    color: '#9ca3af',
                  },
                },
                invalid: {
                  color: '#ef4444',
                },
              },
              hidePostalCode: false,
            }}
            onChange={(e) => {
              setCardComplete(e.complete);
              if (e.error) {
                setError(e.error.message);
              } else {
                setError(null);
              }
            }}
          />
        </div>
        {error && (
          <p className="mt-2 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || !cardComplete || loading}
        className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4 font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>Saving card...</span>
          </div>
        ) : (
          'Add Payment Method'
        )}
      </button>

      {/* Security Note */}
      <SecurityNote />

      {/* Accepted Cards */}
      <div className="flex items-center justify-center gap-4 opacity-50">
        <img src="/images/cards/visa.svg" alt="Visa" className="h-8" />
        <img src="/images/cards/mastercard.svg" alt="Mastercard" className="h-8" />
        <img src="/images/cards/amex.svg" alt="Amex" className="h-8" />
        <img src="/images/cards/discover.svg" alt="Discover" className="h-8" />
      </div>
    </form>
  );
}

function SecurityNote() {
  return (
    <div className="rounded-xl bg-gray-100 p-4 dark:bg-zinc-800">
      <div className="flex gap-3">
        <Lock className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">Your payment is secure</strong>
          <p className="mt-1">
            We use Stripe for secure payment processing. Your card details are encrypted and never
            stored on our servers.
          </p>
        </div>
      </div>
    </div>
  );
}
