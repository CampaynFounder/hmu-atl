'use client';

// Return/refresh landing for Stripe Connect onboarding.
//
// Stripe account links require HTTP(S) return/refresh URLs, so the native app's
// onboarding (POST /api/driver/stripe/onboarding-link) sends Stripe here with
// ?mobile=1. We immediately deep-link back into the app via the hmuatl:// scheme;
// WebBrowser.openAuthSessionAsync(url, 'hmuatl://') detects that scheme, closes
// the in-app browser, and returns control to the PayoutSetup screen, which then
// refreshes payout status.
//
// Opened in a plain web browser (no ?mobile=1), it just lands on the web payout
// page — so the same return URL is safe for both surfaces.

import { useEffect, useState } from 'react';

export default function PayoutComplete() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isMobile = params.get('mobile') === '1';

    if (isMobile) {
      // Deep link back into the native app. openAuthSessionAsync intercepts the
      // hmuatl:// navigation and hands control back to the app.
      window.location.href = 'hmuatl://payout-complete';
      // Fallback UI if the app didn't catch the redirect (e.g. opened in Safari).
      const t = setTimeout(() => setStuck(true), 1500);
      return () => clearTimeout(t);
    }

    // Web browser: go to the normal payout page.
    window.location.href = '/driver/payout-setup?setup=complete';
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#080808',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 16, color: '#aaa' }}>Returning to HMU ATL…</p>
      {stuck && (
        <a
          href="hmuatl://payout-complete"
          style={{
            fontSize: 15,
            color: '#00E676',
            border: '1px solid rgba(0,230,118,0.3)',
            borderRadius: 999,
            padding: '12px 28px',
            textDecoration: 'none',
          }}
        >
          Tap to return to the app
        </a>
      )}
    </main>
  );
}
