'use client';

// Mobile-only embedded Stripe Connect onboarding, rendered inside the native
// app's in-app WebView (mobile/app/(driver)/payout-embedded.tsx). This removes
// the external-browser bounce: the driver stays inside HMU.
//
// Auth: the WebView is NOT authenticated with Clerk cookies. Instead the RN app
// (which holds the Clerk token) injects it as `window.__HMU_TOKEN` via
// injectedJavaScriptBeforeContentLoaded, and we call the AccountSession endpoint
// with an Authorization: Bearer header. So this route MUST be public (whitelisted
// in middleware) — the bearer token + the short-lived AccountSession client
// secret are the capability.
//
// Communicates back to RN with window.ReactNativeWebView.postMessage:
//   {type:'ready'}  — embedded UI mounted
//   {type:'exit'}   — driver finished/exited onboarding (RN refetches status)
//   {type:'error', message} — failed to init (RN falls back to the browser link)

import { useState, useEffect } from 'react';
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
} from '@stripe/react-connect-js';
import { loadConnectAndInitialize } from '@stripe/connect-js';

declare global {
  interface Window {
    __HMU_TOKEN?: string;
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

function toRN(type: string, extra?: Record<string, unknown>) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...extra }));
  } catch {
    /* not in a WebView — no-op */
  }
}

const APPEARANCE = {
  variables: {
    fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif',
    colorPrimary: '#00E676',
    colorBackground: '#141414',
    colorText: '#ffffff',
    colorSecondaryText: '#888888',
    colorBorder: 'rgba(255,255,255,0.12)',
    colorDanger: '#FF5252',
    borderRadius: '12px',
    spacingUnit: '11px',
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
  },
};

export default function EmbeddedMobileOnboarding() {
  const [connectInstance, setConnectInstance] = useState<ReturnType<typeof loadConnectAndInitialize> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      setError('Payments are temporarily unavailable.');
      toRN('error', { message: 'no_publishable_key' });
      return;
    }
    try {
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => {
          const token = window.__HMU_TOKEN;
          const res = await fetch('/api/driver/payout-setup/session', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.clientSecret) {
            toRN('error', { message: (data as { error?: string }).error ?? 'session_failed' });
            return '';
          }
          return data.clientSecret as string;
        },
        appearance: APPEARANCE,
      });
      setConnectInstance(instance);
      toRN('ready');
    } catch {
      setError('Could not start payout setup.');
      toRN('error', { message: 'init_failed' });
    }
  }, []);

  if (error) {
    return (
      <div style={{ background: '#0a0a0a', color: '#FF5252', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }}>
        {error}
      </div>
    );
  }
  if (!connectInstance) {
    return (
      <div style={{ background: '#0a0a0a', color: '#888', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '12px 12px 40px' }}>
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectAccountOnboarding onExit={() => toRN('exit')} />
      </ConnectComponentsProvider>
    </div>
  );
}
