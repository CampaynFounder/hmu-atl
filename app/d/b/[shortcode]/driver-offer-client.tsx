'use client';

// Stream C — driver offer client. Renders blast details + 3 CTAs.
// HMU: firm at rider's price → POST /api/blast/[id]/targets/[targetId]/hmu
// Counter: slider clamped ±counter_offer_max_pct → /counter
// Pass: collapse → /pass
// Server returns 402 + { payout_onboarding_url } if Stripe gate not cleared;
// we open <DriverPayoutGate> in that case (per project-stripe-driver-gating).

import { useCallback, useEffect, useState } from 'react';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import {
  CountUpNumber,
  ShimmerSlot,
  SuccessCheckmark,
} from '@/components/blast/motion';
import { DriverPayoutGate } from '@/components/blast/driver/driver-payout-gate';

interface Blast {
  id: string;
  shortcode: string;
  riderFirstName?: string;
  riderPhotoUrl?: string;
  riderChillScore?: number;
  pickupAddress: string;
  dropoffAddress: string;
  priceDollars: number;
  scheduledFor: string | null;
  counterOfferMaxPct?: number; // 0..1, default 0.25
}

interface Target {
  id: string;
  driverId: string;
  notifiedAt: string | null;
}

export interface DriverOfferClientProps {
  shortcode: string;
  driverId: string;
  stripeReady: boolean;
  source?: 'sms' | 'feed' | 'push';
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'submitting'; action: 'hmu' | 'counter' | 'pass' }
  | { kind: 'success'; action: 'hmu' | 'counter' | 'pass' }
  | { kind: 'error'; message: string };

export function DriverOfferClient({ shortcode, driverId, stripeReady, source }: DriverOfferClientProps) {
  const router = useRouter();

  const [blast, setBlast] = useState<Blast | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counterPrice, setCounterPrice] = useState<number | null>(null);
  const [actionState, setActionState] = useState<ActionState>({ kind: 'idle' });
  const [gateOpen, setGateOpen] = useState(false);
  const [gateAction, setGateAction] = useState<'hmu' | 'counter'>('hmu');

  // ─── Fetch blast + driver's target row ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/blast/${shortcode}`);
        if (!res.ok) {
          if (!cancelled) setLoadError(res.status === 404 ? 'Ride not found.' : 'Could not load ride details.');
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        setBlast(body.blast ?? null);
        const targetRow = (body.targets ?? []).find((t: Target) => t.driverId === driverId)
          ?? (body.fallback ?? []).find((t: Target) => t.driverId === driverId)
          ?? null;
        setTarget(targetRow);
        // Init counter price at the asking price.
        if (body.blast?.priceDollars) setCounterPrice(body.blast.priceDollars);
        posthog.capture('driver_offer_page_viewed', { source: source ?? null });
      } catch {
        if (!cancelled) setLoadError('Network problem — try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [shortcode, driverId, source]);

  const counterMin = useMemo(() => {
    if (!blast) return 0;
    const pct = blast.counterOfferMaxPct ?? 0.25;
    return Math.max(1, Math.round(blast.priceDollars * (1 - pct)));
  }, [blast]);
  const counterMax = useMemo(() => {
    if (!blast) return 0;
    const pct = blast.counterOfferMaxPct ?? 0.25;
    return Math.round(blast.priceDollars * (1 + pct));
  }, [blast]);

  const submit = useCallback(async (action: 'hmu' | 'counter' | 'pass', body?: object) => {
    if (!target || !blast) return;

    if ((action === 'hmu' || action === 'counter') && !stripeReady) {
      setGateAction(action);
      setGateOpen(true);
      return;
    }

    setActionState({ kind: 'submitting', action });
    try {
      const res = await fetch(`/api/blast/${blast.id}/targets/${target.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 402) {
        const payload = await res.json().catch(() => ({}));
        setActionState({ kind: 'idle' });
        setGateAction(action === 'pass' ? 'hmu' : action);
        setGateOpen(true);
        if (payload?.payout_onboarding_url) {
          // Allow user to navigate via the gate's CTA; payload is informational.
        }
        return;
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setActionState({ kind: 'error', message: payload.error || 'Something went wrong.' });
        return;
      }
      setActionState({ kind: 'success', action });
      const eventName =
        action === 'hmu' ? 'blast_target_hmu'
          : action === 'counter' ? 'blast_target_counter'
            : 'blast_target_pass';
      posthog.capture(eventName, body ?? {});
      // Brief beat to show success state, then route to "waiting" view (offer board for HMU/counter)
      setTimeout(() => {
        if (action === 'hmu' || action === 'counter') {
          router.push(`/d/b/${shortcode}/waiting`);
        } else {
          router.push('/driver/requests');
        }
      }, 700);
    } catch {
      setActionState({ kind: 'error', message: 'Network problem — try again.' });
    }
  }, [target, blast, stripeReady, shortcode, router]);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <main
      style={{
        minHeight: '100dvh',
        paddingTop: 'var(--header-height, 3.5rem)',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 24,
        background: '#080808', color: '#fff',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      <div style={{ maxWidth: 520, margin: '20px auto 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!blast && !loadError && (
          <>
            <ShimmerSlot height={56} radius={14} />
            <ShimmerSlot height={140} radius={20} />
            <ShimmerSlot height={56} radius={100} />
          </>
        )}
        {loadError && <p style={{ color: '#FF8A8A' }}>{loadError}</p>}

        {blast && (
          <>
            <RiderHeader blast={blast} />
            <RouteCard blast={blast} />
            <PriceCallout
              ask={blast.priceDollars}
              counter={counterPrice ?? blast.priceDollars}
              counterMin={counterMin}
              counterMax={counterMax}
              onCounterChange={setCounterPrice}
            />
            <ActionButtons
              ask={blast.priceDollars}
              counter={counterPrice ?? blast.priceDollars}
              state={actionState}
              onHmu={() => submit('hmu')}
              onCounter={() => submit('counter', { counterPriceDollars: counterPrice })}
              onPass={() => submit('pass')}
            />
            {actionState.kind === 'error' && (
              <p style={{ color: '#FF8A8A', fontSize: 14, textAlign: 'center' }}>{actionState.message}</p>
            )}
          </>
        )}
      </div>

      <DriverPayoutGate
        open={gateOpen}
        action={gateAction}
        onClose={() => setGateOpen(false)}
      />
    </main>
  );
}

function RiderHeader({ blast }: { blast: Blast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {blast.riderPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={blast.riderPhotoUrl}
          alt={blast.riderFirstName ?? 'Rider'}
          style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'rgba(0,230,118,0.12)', color: '#00E676',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 700,
        }}>
          {(blast.riderFirstName ?? '?').slice(0, 1).toUpperCase()}
        </div>
      )}
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{blast.riderFirstName ?? 'Rider'}</div>
        {typeof blast.riderChillScore === 'number' && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            Chill {blast.riderChillScore.toFixed(0)}
          </div>
        )}
      </div>
    </div>
  );
}

function RouteCard({ blast }: { blast: Blast }) {
  return (
    <div style={{ padding: 16, borderRadius: 18, background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={ROW}>
        <span style={DOT_GREEN} />
        <span>{blast.pickupAddress}</span>
      </div>
      <div style={{ ...ROW, marginTop: 10 }}>
        <span style={DOT_AMBER} />
        <span>{blast.dropoffAddress}</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
        {blast.scheduledFor ? new Date(blast.scheduledFor).toLocaleString() : 'Pick up now'}
      </div>
    </div>
  );
}

function PriceCallout({
  ask,
  counter,
  counterMin,
  counterMax,
  onCounterChange,
}: {
  ask: number;
  counter: number;
  counterMin: number;
  counterMax: number;
  onCounterChange: (v: number) => void;
}) {
  return (
    <div style={{ padding: 16, borderRadius: 18, background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Asking
        </span>
        <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 24, fontWeight: 700, color: '#00E676' }}>
          ${ask}
        </span>
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Counter</span>
          <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 18, fontWeight: 700 }}>
            $<CountUpNumber value={counter} />
          </span>
        </div>
        <input
          type="range"
          min={counterMin}
          max={counterMax}
          step={1}
          value={counter}
          onChange={(e) => onCounterChange(Number(e.target.value))}
          aria-label="Counter offer price"
          style={{ width: '100%', accentColor: '#00E676' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          <span>${counterMin}</span>
          <span>${counterMax}</span>
        </div>
      </div>
    </div>
  );
}

function ActionButtons({
  ask,
  counter,
  state,
  onHmu,
  onCounter,
  onPass,
}: {
  ask: number;
  counter: number;
  state: ActionState;
  onHmu: () => void;
  onCounter: () => void;
  onPass: () => void;
}) {
  const submitting = state.kind === 'submitting';
  const success = state.kind === 'success';
  const successAction = success ? state.action : null;

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <SuccessCheckmark size={56} />
        <p style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>
          {successAction === 'hmu' ? 'HMU sent' : successAction === 'counter' ? `Counter $${counter} sent` : 'Passed'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <motion.button
        type="button"
        onClick={onHmu}
        disabled={submitting}
        whileTap={submitting ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ ...PRIMARY, opacity: submitting ? 0.6 : 1 }}
      >
        {state.kind === 'submitting' && state.action === 'hmu' ? 'Sending…' : `HMU at $${ask}`}
      </motion.button>
      {counter !== ask && (
        <motion.button
          type="button"
          onClick={onCounter}
          disabled={submitting}
          whileTap={submitting ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{ ...OUTLINE, opacity: submitting ? 0.6 : 1 }}
        >
          {state.kind === 'submitting' && state.action === 'counter' ? 'Sending…' : `Counter at $${counter}`}
        </motion.button>
      )}
      <button
        type="button"
        onClick={onPass}
        disabled={submitting}
        style={{ ...GHOST, opacity: submitting ? 0.6 : 1 }}
      >
        {state.kind === 'submitting' && state.action === 'pass' ? 'Passing…' : 'Not for me'}
      </button>
    </div>
  );
}

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#fff',
};
const DOT_GREEN: React.CSSProperties = {
  width: 10, height: 10, borderRadius: '50%', background: '#00E676', flexShrink: 0,
};
const DOT_AMBER: React.CSSProperties = {
  width: 10, height: 10, borderRadius: '50%', background: '#FFB300', flexShrink: 0,
};
const PRIMARY: React.CSSProperties = {
  width: '100%', padding: '16px 24px', borderRadius: 100,
  background: '#00E676', color: '#080808',
  fontSize: 16, fontWeight: 700, border: 'none',
  cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
  boxShadow: '0 0 24px rgba(0,230,118,0.25)',
};
const OUTLINE: React.CSSProperties = {
  width: '100%', padding: '16px 24px', borderRadius: 100,
  background: 'transparent', color: '#00E676',
  fontSize: 16, fontWeight: 700, border: '2px solid #00E676',
  cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};
const GHOST: React.CSSProperties = {
  width: '100%', padding: '12px 18px', borderRadius: 100,
  background: 'transparent', color: 'rgba(255,255,255,0.55)',
  fontSize: 14, fontWeight: 500, border: 'none',
  cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};
