'use client';

import { useState, useCallback } from 'react';
import {
  ConnectComponentsProvider,
  ConnectPayouts,
  ConnectAccountManagement,
} from '@stripe/react-connect-js';
import { loadConnectAndInitialize } from '@stripe/connect-js';

type Tab = 'payouts' | 'account';

export default function StripeEmbedded() {
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('payouts');

  const [connectInstance] = useState(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) return null;

    return loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        const res = await fetch('/api/driver/payout-setup/session', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.clientSecret) {
          setError(data.error || 'Failed to load Stripe');
          return '';
        }
        return data.clientSecret;
      },
      appearance: {
        variables: {
          fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif',
          colorPrimary: '#00E676',
          colorBackground: '#141414',
          colorText: '#ffffff',
          colorSecondaryText: '#888888',
          colorBorder: 'rgba(255,255,255,0.12)',
          colorDanger: '#FF5252',
          borderRadius: '12px',
          spacingUnit: '12px',
          buttonPrimaryColorBackground: '#00E676',
          buttonPrimaryColorText: '#080808',
          buttonPrimaryColorBorder: '#00E676',
          buttonSecondaryColorBackground: '#1a1a1a',
          buttonSecondaryColorText: '#ffffff',
          buttonSecondaryColorBorder: 'rgba(255,255,255,0.12)',
          formBackgroundColor: '#1a1a1a',
          formHighlightColorBorder: '#00E676',
          actionPrimaryColorText: '#00E676',
          actionSecondaryColorText: '#888888',
          badgeNeutralColorBackground: '#1a1a1a',
          badgeNeutralColorText: '#888888',
          badgeNeutralColorBorder: 'rgba(255,255,255,0.08)',
          badgeSuccessColorBackground: 'rgba(0,230,118,0.08)',
          badgeSuccessColorText: '#00E676',
          badgeWarningColorBackground: 'rgba(255,179,0,0.08)',
          badgeWarningColorText: '#FFB300',
          badgeDangerColorBackground: 'rgba(255,82,82,0.08)',
          badgeDangerColorText: '#FF5252',
        },
      },
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleError = useCallback((err: any) => {
    console.error('Stripe embedded component error:', err);
    setError(err?.error?.message || 'Stripe component failed to load');
  }, []);

  if (!connectInstance) {
    return (
      <div style={{
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px',
        padding: '24px 20px',
        marginBottom: '16px',
      }}>
        <p style={{ fontSize: '13px', color: '#888', textAlign: 'center' }}>
          Stripe components unavailable. Use the fallback option below.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: '#141414',
        border: '1px solid rgba(255,82,82,0.2)',
        borderRadius: '20px',
        padding: '24px 20px',
        marginBottom: '16px',
      }}>
        <p style={{ fontSize: '13px', color: '#FF5252', textAlign: 'center', marginBottom: '8px' }}>
          {error}
        </p>
        <p style={{ fontSize: '11px', color: '#888', textAlign: 'center' }}>
          Use the fallback option below to manage your account via Stripe.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '20px',
      padding: '20px',
      marginBottom: '16px',
    }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {([
          { key: 'payouts' as Tab, label: 'Payouts' },
          { key: 'account' as Tab, label: 'Account Details' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '12px',
              border: tab === t.key ? '2px solid #00E676' : '2px solid rgba(255,255,255,0.08)',
              background: tab === t.key ? 'rgba(0,230,118,0.06)' : '#1a1a1a',
              color: tab === t.key ? '#00E676' : '#888',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-body, DM Sans, sans-serif)',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stripe embedded component */}
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <div style={{ minHeight: '200px' }}>
          {tab === 'payouts' ? (
            <ConnectPayouts
              onLoadError={handleError}
            />
          ) : (
            <ConnectAccountManagement
              onLoadError={handleError}
            />
          )}
        </div>
      </ConnectComponentsProvider>
    </div>
  );
}
