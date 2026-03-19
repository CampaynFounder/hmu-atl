'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // On page load, check URL params for ?setup=complete and refresh status
  useEffect(() => {
    if (searchParams.get('setup') === 'complete') {
      refreshStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/driver/payout-setup');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silently fail — user can refresh manually
    } finally {
      setRefreshing(false);
    }
  };

  const startOnboarding = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/onboarding/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        setError('No onboarding URL returned — try again');
        setLoading(false);
      }
    } catch {
      setError('Network error — check your connection');
      setLoading(false);
    }
  };

  const allComplete = status.stripeComplete && status.hasExternalAccount;

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .ps { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding: 72px 20px 40px; }
        .ps-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
        .ps-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; letter-spacing: 1px; }
        .ps-back { font-size: 14px; color: var(--green); text-decoration: none; font-weight: 600; }
        .ps-subtitle { font-size: 14px; color: var(--gray); margin-top: -20px; margin-bottom: 32px; line-height: 1.5; }

        /* Step indicators */
        .ps-steps { display: flex; flex-direction: column; gap: 0; margin-bottom: 32px; }
        .ps-step { position: relative; padding-left: 48px; padding-bottom: 32px; }
        .ps-step:last-child { padding-bottom: 0; }

        /* Connecting line */
        .ps-step::before { content: ''; position: absolute; left: 17px; top: 36px; bottom: 0; width: 2px; background: rgba(255,255,255,0.08); }
        .ps-step:last-child::before { display: none; }
        .ps-step.ps-step--complete::before { background: rgba(0,230,118,0.3); }

        /* Step circle */
        .ps-step-circle { position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 18px; border: 2px solid rgba(255,255,255,0.15); background: var(--card); color: var(--gray); transition: all 0.3s; }
        .ps-step--active .ps-step-circle { border-color: var(--green); color: var(--green); background: rgba(0,230,118,0.08); }
        .ps-step--complete .ps-step-circle { border-color: var(--green); background: var(--green); color: var(--black); }

        .ps-step-content { padding-top: 2px; }
        .ps-step-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
        .ps-step--pending .ps-step-title { color: var(--gray); }
        .ps-step-desc { font-size: 13px; color: var(--gray); line-height: 1.5; margin-bottom: 16px; }

        /* Cards for payout method options */
        .ps-method-grid { display: flex; flex-direction: column; gap: 10px; }
        .ps-method-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: all 0.15s; -webkit-tap-highlight-color: transparent; }
        .ps-method-card:hover { border-color: rgba(0,230,118,0.3); background: rgba(0,230,118,0.04); }
        .ps-method-card:active { transform: scale(0.98); }
        .ps-method-icon { font-size: 28px; flex-shrink: 0; }
        .ps-method-info { flex: 1; }
        .ps-method-name { font-size: 16px; font-weight: 600; }
        .ps-method-fee { font-size: 12px; color: var(--gray); margin-top: 2px; }
        .ps-method-fee--free { color: var(--green); font-weight: 600; }
        .ps-method-arrow { color: var(--gray); font-size: 18px; }

        /* Buttons */
        .ps-btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 100px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; -webkit-tap-highlight-color: transparent; text-align: center; text-decoration: none; }
        .ps-btn:active { transform: scale(0.97); }
        .ps-btn--green { background: var(--green); color: var(--black); }
        .ps-btn--green:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .ps-btn--outline { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #fff; }

        /* Complete state */
        .ps-complete-check { font-size: 14px; color: var(--green); font-weight: 600; display: flex; align-items: center; gap: 8px; }

        /* Success state */
        .ps-success { text-align: center; padding: 48px 20px; }
        .ps-success-icon { font-size: 64px; margin-bottom: 20px; }
        .ps-success-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; letter-spacing: 1px; margin-bottom: 8px; }
        .ps-success-desc { font-size: 15px; color: var(--gray-light); margin-bottom: 36px; line-height: 1.5; }

        /* Account display */
        .ps-account { background: var(--card); border: 1px solid rgba(0,230,118,0.2); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; gap: 14px; }
        .ps-account-icon { font-size: 24px; }
        .ps-account-info { flex: 1; }
        .ps-account-name { font-size: 15px; font-weight: 600; }
        .ps-account-detail { font-size: 12px; color: var(--gray); margin-top: 2px; font-family: var(--font-mono, 'Space Mono', monospace); }
        .ps-account-check { color: var(--green); font-size: 20px; }

        /* Loading spinner */
        .ps-spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Refreshing banner */
        .ps-refreshing { background: rgba(0,230,118,0.08); border: 1px solid rgba(0,230,118,0.15); border-radius: 12px; padding: 12px 16px; font-size: 13px; color: var(--green); text-align: center; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; gap: 8px; }
      `}</style>

      <div className="ps">
        <div className="ps-header">
          <h1 className="ps-title">Payout Setup</h1>
          <Link href="/driver/profile" className="ps-back">Back</Link>
        </div>
        <p className="ps-subtitle">
          Set up your payout account so you can get paid after every ride.
        </p>

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
          </div>
        )}

        {refreshing && (
          <div className="ps-refreshing">
            <span className="ps-spinner" />
            Checking your setup status...
          </div>
        )}

        {allComplete ? (
          /* ---- SUCCESS STATE ---- */
          <div className="ps-success">
            <div className="ps-success-icon">{'\u2705'}</div>
            <div className="ps-success-title">You&apos;re All Set</div>
            <p className="ps-success-desc">
              Start accepting rides and get paid directly to your account.
            </p>

            {status.hasExternalAccount && (
              <div className="ps-account" style={{ marginBottom: '24px', textAlign: 'left' }}>
                <div className="ps-account-icon">
                  {status.accountType === 'card' ? '\uD83D\uDCB3' : '\uD83C\uDFE6'}
                </div>
                <div className="ps-account-info">
                  <div className="ps-account-name">
                    {status.bankName || (status.accountType === 'card' ? 'Debit Card' : 'Bank Account')}
                  </div>
                  <div className="ps-account-detail">
                    {status.accountType === 'card' ? 'Card' : 'Account'} ending in {status.last4}
                  </div>
                </div>
                <div className="ps-account-check">{'\u2713'}</div>
              </div>
            )}

            <Link href="/driver/feed" className="ps-btn ps-btn--green">
              Go Live
            </Link>
          </div>
        ) : (
          /* ---- STEP-BY-STEP FLOW ---- */
          <div className="ps-steps">
            {/* Step 1: Verify Identity */}
            <div className={`ps-step ${status.stripeComplete ? 'ps-step--complete' : 'ps-step--active'}`}>
              <div className="ps-step-circle">
                {status.stripeComplete ? '\u2713' : '1'}
              </div>
              <div className="ps-step-content">
                <div className="ps-step-title">Verify Your Identity</div>
                <p className="ps-step-desc">
                  Stripe handles identity verification securely. This is required before you can receive payouts.
                </p>

                {status.stripeComplete ? (
                  <div className="ps-complete-check">
                    {'\u2713'} Identity Verified
                  </div>
                ) : (
                  <button
                    className="ps-btn ps-btn--green"
                    onClick={startOnboarding}
                    disabled={loading}
                  >
                    {loading ? (
                      <><span className="ps-spinner" />Redirecting...</>
                    ) : (
                      'Verify Identity'
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Step 2: Add Payout Account */}
            <div className={`ps-step ${status.hasExternalAccount ? 'ps-step--complete' : status.stripeComplete ? 'ps-step--active' : 'ps-step--pending'}`}>
              <div className="ps-step-circle">
                {status.hasExternalAccount ? '\u2713' : '2'}
              </div>
              <div className="ps-step-content">
                <div className="ps-step-title">Add Payout Account</div>
                <p className="ps-step-desc">
                  Choose how you want to get paid after each ride.
                </p>

                {status.hasExternalAccount ? (
                  <div className="ps-account">
                    <div className="ps-account-icon">
                      {status.accountType === 'card' ? '\uD83D\uDCB3' : '\uD83C\uDFE6'}
                    </div>
                    <div className="ps-account-info">
                      <div className="ps-account-name">
                        {status.bankName || (status.accountType === 'card' ? 'Debit Card' : 'Bank Account')}
                      </div>
                      <div className="ps-account-detail">
                        {status.accountType === 'card' ? 'Card' : 'Account'} ending in {status.last4}
                      </div>
                    </div>
                    <div className="ps-account-check">{'\u2713'}</div>
                  </div>
                ) : status.stripeComplete ? (
                  <div className="ps-method-grid">
                    <div className="ps-method-card" onClick={startOnboarding}>
                      <div className="ps-method-icon">{'\uD83C\uDFE6'}</div>
                      <div className="ps-method-info">
                        <div className="ps-method-name">Bank Account</div>
                        <div className="ps-method-fee ps-method-fee--free">FREE</div>
                      </div>
                      <div className="ps-method-arrow">{'\u203A'}</div>
                    </div>
                    <div className="ps-method-card" onClick={startOnboarding}>
                      <div className="ps-method-icon">{'\uD83D\uDCB3'}</div>
                      <div className="ps-method-info">
                        <div className="ps-method-name">Debit Card</div>
                        <div className="ps-method-fee">0.5% fee</div>
                      </div>
                      <div className="ps-method-arrow">{'\u203A'}</div>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--gray)', fontStyle: 'italic' }}>
                    Complete Step 1 first
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
