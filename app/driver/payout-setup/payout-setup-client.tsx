'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const DriverPaymentForm = dynamic(() => import('@/components/payments/driver-payment-form'), { ssr: false });
const StripeEmbedded = dynamic(() => import('./stripe-embedded'), { ssr: false });
import ManageAccounts from './manage-accounts';

interface PayoutStatus {
  stripeAccountId: string | null;
  stripeComplete: boolean;
  hasExternalAccount: boolean;
  last4: string | null;
  accountType: string | null;
  bankName: string | null;
  setupComplete: boolean;
}

interface Props {
  initialStatus: PayoutStatus;
}

export default function PayoutSetupClient({ initialStatus }: Props) {
  const [status, setStatus] = useState<PayoutStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh status on mount if stripe account exists but setup isn't complete
  useEffect(() => {
    if (initialStatus.stripeAccountId && !initialStatus.setupComplete) {
      refreshStatus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshStatus() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/driver/payout-setup');
      if (res.ok) {
        const data = await res.json();
        setStatus({
          stripeAccountId: data.stripeAccountId,
          stripeComplete: data.stripeComplete,
          hasExternalAccount: !!data.stripeAccount,
          last4: data.stripeAccount?.last4 || null,
          accountType: data.stripeAccount?.type || null,
          bankName: data.stripeAccount?.bank || null,
          setupComplete: data.setupComplete,
        });
      }
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/onboarding/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        setError('No onboarding URL returned');
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setLoading(false);
    }
  }


  const [hasPaymentMethod, setHasPaymentMethod] = useState<boolean | null>(null);

  // Check if driver has a saved payment method
  useEffect(() => {
    fetch('/api/driver/payment-setup')
      .then(r => r.json())
      .then(data => setHasPaymentMethod(data.hasPaymentMethod || false))
      .catch(() => setHasPaymentMethod(false));
  }, []);

  const allComplete = status.stripeComplete && status.hasExternalAccount && hasPaymentMethod === true;

  return (
    <div style={{
      background: '#080808',
      color: '#fff',
      minHeight: '100svh',
      fontFamily: 'var(--font-body, DM Sans, sans-serif)',
      padding: '72px 20px 40px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', fontSize: '32px' }}>
          Payout Setup
        </h1>
        <Link href="/driver/profile" style={{ color: '#00E676', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}>
          Back
        </Link>
      </div>
      <p style={{ fontSize: '14px', color: '#888', marginBottom: '24px', lineHeight: 1.5 }}>
        Setup Payout Account So You Can Get Paid Upfront.
      </p>

      {/* Refreshing */}
      {refreshing && (
        <div style={{
          background: 'rgba(0,230,118,0.08)',
          border: '1px solid rgba(0,230,118,0.15)',
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '14px',
          color: '#00E676',
          textAlign: 'center',
          marginBottom: '16px',
        }}>
          Checking your Stripe status...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(255,68,68,0.1)',
          border: '1px solid rgba(255,68,68,0.25)',
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '14px',
          color: '#FF5252',
          marginBottom: '16px',
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'none', border: 'none', color: '#FF5252', cursor: 'pointer', fontSize: '16px' }}
          >
            x
          </button>
        </div>
      )}

      {allComplete ? (
        /* Success */
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>&#x2705;</div>
          <div style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', fontSize: '36px', marginBottom: '8px' }}>
            You&apos;re All Set
          </div>
          <p style={{ fontSize: '15px', color: '#bbb', marginBottom: '20px' }}>
            Start accepting rides and get paid directly to your account.
          </p>

          {/* Stripe verification notice */}
          <div style={{
            background: 'rgba(255,179,0,0.06)',
            border: '1px solid rgba(255,179,0,0.15)',
            borderRadius: '16px',
            padding: '16px 20px',
            marginBottom: '24px',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>&#x23F3;</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFB300', marginBottom: '6px' }}>
                  Go ahead — start picking up riders
                </div>
                <p style={{ fontSize: '13px', color: '#999', lineHeight: 1.5, margin: 0 }}>
                  Stripe is verifying your account in the background. This usually takes 1-2 days.
                  Your earnings are safe and will be held until verification is complete.
                </p>
                <p style={{ fontSize: '13px', color: '#999', lineHeight: 1.5, margin: '8px 0 0' }}>
                  We&apos;ll text you as soon as instant payouts are ready.
                </p>
              </div>
            </div>
          </div>
          {status.last4 && (
            <div style={{
              background: '#141414',
              border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '16px',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '24px' }}>{status.accountType === 'card' ? '\uD83D\uDCB3' : '\uD83C\uDFE6'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>
                    {status.bankName || (status.accountType === 'card' ? 'Debit Card' : 'Bank Account')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', fontFamily: 'var(--font-mono, Space Mono, monospace)' }}>
                    ending in {status.last4}
                  </div>
                </div>
                <span style={{ color: '#00E676', fontSize: '20px' }}>&#x2713;</span>
              </div>
            </div>
          )}
          <Link
            href="/driver/feed"
            style={{
              display: 'block',
              padding: '16px',
              borderRadius: '100px',
              background: '#00E676',
              color: '#080808',
              fontWeight: 700,
              fontSize: '16px',
              textAlign: 'center',
              textDecoration: 'none',
              marginBottom: '24px',
            }}
          >
            Go Live
          </Link>

          <StripeEmbedded />

          <ManageAccounts onUpdate={refreshStatus} />
        </div>
      ) : (
        /* Steps */
        <div>
          {/* Step 1 */}
          <div style={{
            background: '#141414',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px 20px',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 700,
                background: status.stripeComplete ? '#00E676' : 'rgba(0,230,118,0.08)',
                color: status.stripeComplete ? '#080808' : '#00E676',
                border: '2px solid #00E676',
                flexShrink: 0,
              }}>
                {status.stripeComplete ? '\u2713' : '1'}
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Verify Your Identity</div>
                <div style={{ fontSize: '13px', color: '#888' }}>Stripe handles verification securely</div>
              </div>
            </div>

            {status.stripeComplete ? (
              <div style={{ color: '#00E676', fontWeight: 600, fontSize: '14px' }}>
                &#x2713; Identity Verified
              </div>
            ) : (
              <button
                type="button"
                onClick={startOnboarding}
                disabled={loading}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '16px',
                  borderRadius: '100px',
                  border: 'none',
                  background: loading ? 'rgba(0,230,118,0.3)' : '#00E676',
                  color: '#080808',
                  fontWeight: 700,
                  fontSize: '16px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                }}
              >
                {loading ? 'Connecting to Stripe...' : 'Verify Identity'}
              </button>
            )}
          </div>

          {/* Step 2: Payment method for purchases */}
          <Step2PaymentMethod stripeComplete={status.stripeComplete} />

          {/* Refresh button */}
          <button
            type="button"
            onClick={refreshStatus}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '16px',
              padding: '14px',
              borderRadius: '100px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: '#888',
              fontSize: '14px',
              cursor: 'pointer',
              fontFamily: 'var(--font-body, DM Sans, sans-serif)',
            }}
          >
            Refresh Status
          </button>
        </div>
      )}
    </div>
  );
}

function Step2PaymentMethod({ stripeComplete }: { stripeComplete: boolean }) {
  const [hasMethod, setHasMethod] = useState<boolean | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [last4, setLast4] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch('/api/driver/payment-setup')
      .then(r => r.json())
      .then(data => {
        setHasMethod(data.hasPaymentMethod || false);
        setBrand(data.brand || null);
        setLast4(data.last4 || null);
      })
      .catch(() => setHasMethod(false));
  }, []);

  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '20px',
      padding: '24px 20px',
      opacity: stripeComplete ? 1 : 0.4,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: 700,
          background: hasMethod ? '#00E676' : '#1a1a1a',
          color: hasMethod ? '#080808' : '#888',
          border: `2px solid ${hasMethod ? '#00E676' : 'rgba(255,255,255,0.15)'}`,
          flexShrink: 0,
        }}>
          {hasMethod ? '\u2713' : '2'}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>Payment Method</div>
          <div style={{ fontSize: '13px', color: '#888' }}>For HMU First + Cash Pack purchases</div>
        </div>
      </div>

      {hasMethod && !showForm ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#00E676', fontWeight: 600, fontSize: '14px' }}>
            {'\u2713'} {(brand || 'Card').charAt(0).toUpperCase() + (brand || 'card').slice(1)} ending in {last4}
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: 'none', border: '1px solid rgba(0,230,118,0.3)',
              color: '#00E676', fontSize: 12, fontWeight: 600,
              padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
              fontFamily: 'var(--font-body, DM Sans, sans-serif)',
            }}
          >
            Update
          </button>
        </div>
      ) : stripeComplete ? (
        showForm || !hasMethod ? (
          <DriverPaymentForm onSuccess={() => {
            setShowForm(false);
            setHasMethod(true);
            // Refresh details
            fetch('/api/driver/payment-setup')
              .then(r => r.json())
              .then(data => { setBrand(data.brand); setLast4(data.last4); setHasMethod(true); })
              .catch(() => {});
          }} />
        ) : (
          <div style={{ textAlign: 'center', padding: '12px', color: '#888', fontSize: 13 }}>
            Checking...
          </div>
        )
      ) : (
        <p style={{ fontSize: '13px', color: '#888', fontStyle: 'italic' }}>
          Complete Step 1 first
        </p>
      )}
    </div>
  );
}
