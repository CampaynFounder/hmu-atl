'use client';

// Slide-up payment-method capture, mounted in the rider browse experience.
// Reuses InlinePaymentForm verbatim — the same component used everywhere
// in the rider app a card is linked — so the UX is identical and there's
// no Stripe-hosted redirect.
//
// Mounted by app/rider/browse/rider-browse-client.tsx when:
//   - GET /api/rider/payment-methods returns zero saved methods, AND
//   - The rider taps the HMU/Book button on a driver card.
// Profile viewing is intentionally NOT gated — only booking is.

import { useEffect } from 'react';
import dynamic from 'next/dynamic';

const InlinePaymentForm = dynamic(
  () => import('@/components/payments/inline-payment-form'),
  { ssr: false },
);

interface Props {
  open: boolean;
  driverDisplayName?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function FirstTimePaymentSheet({ open, driverDisplayName, onSuccess, onCancel }: Props) {
  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440,
          background: '#0c0c0c',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTop: '1px solid rgba(0,230,118,0.24)',
          padding: '12px 16px max(20px, env(safe-area-inset-bottom))',
          maxHeight: '90vh', overflowY: 'auto',
          animation: 'rider-pay-slide-up 220ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 100, background: 'rgba(255,255,255,0.18)',
          margin: '0 auto 14px',
        }} />

        <div style={{ textAlign: 'center', marginBottom: 14, padding: '0 8px' }}>
          <div style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 24, color: '#fff', lineHeight: 1, marginBottom: 6,
          }}>
            ONE QUICK STEP
          </div>
          <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
            {driverDisplayName ? (
              <>Link a payment to book with <strong style={{ color: '#fff' }}>{driverDisplayName}</strong>.</>
            ) : (
              <>Link a payment to book this ride.</>
            )}
            <br />
            Held safely — only charged when the ride starts.
          </div>
        </div>

        <InlinePaymentForm onSuccess={onSuccess} onCancel={onCancel} compact />
      </div>

      <style jsx>{`
        @keyframes rider-pay-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
