'use client';

// Stream C — Stripe Connect approval gate for driver actions on a blast.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-10 + project-stripe-driver-gating
// memory: drivers can browse + receive blasts without an approved Stripe
// account, but acting on one (HMU / counter / pass) requires payout-ready
// status. Stream B's endpoints return 402 + { payout_onboarding_url } when
// the driver hits the gate; this overlay activates on that signal.
//
// Pattern mirrors components/rider/first-time-payment-blocker.tsx (rider
// analogue) — slide-up sheet, body scroll lock, primary CTA routes to the
// EXISTING /driver/payout-setup flow (do not rebuild Stripe Connect
// onboarding; reuse the audited path at app/api/driver/payout-setup/).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';

export interface DriverPayoutGateProps {
  open: boolean;
  /** What the driver was attempting when the gate triggered — for analytics. */
  action: 'hmu' | 'counter';
  /** URL to send the driver to for payout setup. Defaults to /driver/payout-setup. */
  payoutUrl?: string;
  onClose?: () => void;
}

export function DriverPayoutGate({
  open,
  action,
  payoutUrl = '/driver/payout-setup',
  onClose,
}: DriverPayoutGateProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    posthog.capture('driver_stripe_gate_shown', { action });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, action]);

  function handleLink() {
    router.push(payoutUrl);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              background: 'rgba(8,8,8,0.6)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          />
          {/* Sheet */}
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-payout-gate-title"
            initial={reduceMotion ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduceMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 81,
              background: '#141414',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: '20px 22px 32px',
              maxWidth: 520, margin: '0 auto',
              boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.18)', margin: '0 auto 18px' }} />
            <h2 id="driver-payout-gate-title" style={H2}>Link your payout to drive</h2>
            <p style={SUB}>
              {action === 'hmu' ? 'You\'re a tap away from this ride.' : 'Almost there.'}{' '}
              Stripe needs to know where to send your earnings before you can{' '}
              {action === 'hmu' ? 'HMU' : 'counter'}. Takes ~2 minutes.
            </p>
            <ul style={BULLETS}>
              <li>Bank account or debit card</li>
              <li>Government ID</li>
              <li>SSN (last 4)</li>
            </ul>
            <motion.button
              type="button"
              onClick={handleLink}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={CTA}
            >
              Link Payout
            </motion.button>
            {onClose && (
              <button type="button" onClick={onClose} style={SECONDARY}>
                Not yet
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const H2: React.CSSProperties = {
  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
  fontSize: 28, lineHeight: 1, letterSpacing: 1, margin: '0 0 10px', color: '#fff',
};
const SUB: React.CSSProperties = {
  fontSize: 15, color: 'rgba(255,255,255,0.7)', margin: '0 0 16px', lineHeight: 1.45,
};
const BULLETS: React.CSSProperties = {
  margin: '0 0 22px', paddingLeft: 18, color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.7,
};
const CTA: React.CSSProperties = {
  width: '100%', padding: '16px 24px', borderRadius: 100,
  background: '#00E676', color: '#080808',
  fontSize: 16, fontWeight: 700, border: 'none',
  cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
  boxShadow: '0 0 24px rgba(0,230,118,0.25)',
};
const SECONDARY: React.CSSProperties = {
  width: '100%', marginTop: 10, padding: '10px 18px', borderRadius: 100,
  background: 'transparent', color: 'rgba(255,255,255,0.55)',
  fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};
