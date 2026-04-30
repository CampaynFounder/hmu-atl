'use client';

// Full-page payment blocker for first-time riders coming from /r/express.
// Shows the rider their driver list (value) but blurs the page and disables
// all interaction until they link a card. Distinct from FirstTimePaymentSheet
// (per-action gate, which we're not using right now). Mounted by
// app/rider/browse/rider-browse-client.tsx when:
//   - URL has ?firstTime=1
//   - GET /api/rider/payment-methods returns zero saved methods.
// On successful link, fades out and never returns this session.

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const InlinePaymentForm = dynamic(
  () => import('@/components/payments/inline-payment-form'),
  { ssr: false },
);

interface Props {
  onSuccess: () => void;
}

export function FirstTimePaymentBlocker({ onSuccess }: Props) {
  const [closing, setClosing] = useState(false);

  // Lock body scroll while the blocker is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleSuccess() {
    setClosing(true);
    // Slight delay lets the fade-out animation finish before the page goes live.
    window.setTimeout(onSuccess, 240);
  }

  return (
    <div
      // role=dialog with no aria-describedby — InlinePaymentForm renders its own
      // labels. The backdrop intentionally swallows clicks (no cancel path).
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(8,8,8,0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
        opacity: closing ? 0 : 1,
        transition: 'opacity 220ms ease-out',
        animation: closing ? undefined : 'rider-blocker-fade-in 220ms ease-out',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420,
          background: '#0c0c0c',
          borderRadius: 20,
          border: '1px solid rgba(0,230,118,0.24)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          padding: '20px 18px',
          maxHeight: '92vh', overflowY: 'auto',
          animation: closing ? undefined : 'rider-blocker-pop-in 280ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* Headline */}
        <div style={{ textAlign: 'center', marginBottom: 14, padding: '4px 8px 0' }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(0,230,118,0.12)', color: '#00E676',
            fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 100,
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
          }}>
            Last step
          </div>
          <div style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 26, color: '#fff', lineHeight: 1, marginBottom: 8,
          }}>
            LINK A PAYMENT METHOD
          </div>
          <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
            Drivers are live behind this screen. Link a card to start tapping in
            — no charge until your ride begins.
          </div>
        </div>

        <InlinePaymentForm onSuccess={handleSuccess} compact />

        <p style={{
          fontSize: 11, color: '#555', textAlign: 'center', marginTop: 12,
          lineHeight: 1.5,
        }}>
          Apple Pay, Google Pay, Cash App Pay, and cards accepted.<br />
          We never charge until your driver actually starts the ride.
        </p>
      </div>

      <style jsx global>{`
        @keyframes rider-blocker-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes rider-blocker-pop-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}
