'use client';

import { useState } from 'react';
import Link from 'next/link';

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

  async function startOnboarding() {
    alert('Button clicked — starting onboarding');
    setLoading(true);
    setError(null);
    try {
      const url = '/api/driver/onboarding/start';
      alert('Fetching: ' + url);
      const res = await fetch(url, { method: 'POST' });
      alert('Response status: ' + res.status);
      const data = await res.json();
      alert('Response data: ' + JSON.stringify(data).substring(0, 200));
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
      const msg = e instanceof Error ? e.message : String(e);
      alert('Fetch error: ' + msg);
      setError(msg);
      setLoading(false);
    }
  }

  async function refreshStatus() {
    try {
      const res = await fetch('/api/driver/payout-setup');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silent
    }
  }

  const allComplete = status.stripeComplete && status.hasExternalAccount;

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
        Set up your payout account so you can get paid after every ride.
      </p>

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
          <p style={{ fontSize: '15px', color: '#bbb', marginBottom: '32px' }}>
            Start accepting rides and get paid directly to your account.
          </p>
          {status.last4 && (
            <div style={{
              background: '#141414',
              border: '1px solid rgba(0,230,118,0.2)',
              borderRadius: '16px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '24px',
              textAlign: 'left',
            }}>
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
            }}
          >
            Go Live
          </Link>
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

          {/* Step 2 */}
          <div style={{
            background: '#141414',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px 20px',
            opacity: status.stripeComplete ? 1 : 0.4,
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
                background: status.hasExternalAccount ? '#00E676' : '#1a1a1a',
                color: status.hasExternalAccount ? '#080808' : '#888',
                border: `2px solid ${status.hasExternalAccount ? '#00E676' : 'rgba(255,255,255,0.15)'}`,
                flexShrink: 0,
              }}>
                {status.hasExternalAccount ? '\u2713' : '2'}
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Add Payout Account</div>
                <div style={{ fontSize: '13px', color: '#888' }}>Choose how you get paid</div>
              </div>
            </div>

            {status.hasExternalAccount ? (
              <div style={{ color: '#00E676', fontWeight: 600, fontSize: '14px' }}>
                &#x2713; {status.bankName || 'Account'} ending in {status.last4}
              </div>
            ) : status.stripeComplete ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  onClick={startOnboarding}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    width: '100%',
                    padding: '18px 20px',
                    background: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    color: '#fff',
                    textAlign: 'left',
                    fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                  }}
                >
                  <span style={{ fontSize: '28px' }}>{'\uD83C\uDFE6'}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '16px', fontWeight: 600 }}>Bank Account</span>
                    <span style={{ display: 'block', fontSize: '12px', color: '#00E676', fontWeight: 600 }}>FREE</span>
                  </span>
                  <span style={{ color: '#888', fontSize: '18px' }}>{'\u203A'}</span>
                </button>
                <button
                  type="button"
                  onClick={startOnboarding}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    width: '100%',
                    padding: '18px 20px',
                    background: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    color: '#fff',
                    textAlign: 'left',
                    fontFamily: 'var(--font-body, DM Sans, sans-serif)',
                  }}
                >
                  <span style={{ fontSize: '28px' }}>{'\uD83D\uDCB3'}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '16px', fontWeight: 600 }}>Debit Card</span>
                    <span style={{ display: 'block', fontSize: '12px', color: '#888' }}>0.5% fee</span>
                  </span>
                  <span style={{ color: '#888', fontSize: '18px' }}>{'\u203A'}</span>
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#888', fontStyle: 'italic' }}>
                Complete Step 1 first
              </p>
            )}
          </div>

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
