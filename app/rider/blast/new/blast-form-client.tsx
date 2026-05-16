'use client';

// /rider/blast/new — v3 bottom-sheet form for the Blast booking flow.
// Stream A (per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-3, D-4, D-12, D-13;
// §4 Stream A row; §5.1 above-the-fold rule; §5.5 frontend feel bar; §6.6
// micro-animation moments; §10 PostHog events).
//
// 8 internal steps (no URL param — internal state machine):
//   1. Pickup       (AddressAutocomplete, REUSE)
//   2. Dropoff      (AddressAutocomplete, REUSE)
//   3. Trip type    (one_way / round_trip chip selector)
//   4. Datetime     (NLP free-text → chip fallback per D-4)
//   5. Storage      (Y/N toggle)
//   6. Price        (+/- $5 stepper, default $25, CountUpNumber animation)
//   7. Driver pref  (multi-select chips + strict toggle, per D-3)
//   8. Rider gender (chips, optional — Woman / Man / Non-binary)
//
// On submit:
//   - saveBlastDraft() to localStorage (30min TTL per D-12)
//   - Unauth → /sign-up?type=rider&draft=blast&returnTo=/auth-callback/blast
//   - Auth   → /auth-callback/blast?mode=signin (skips username + photo)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import { AddressAutocomplete } from '@/components/ride/address-autocomplete';
import { BottomSheet } from '@/components/blast/motion';
import { CountUpNumber } from '@/components/blast/motion';
import { SuccessCheckmark } from '@/components/blast/motion';
import {
  Chip,
  ChipGroup,
  PriceStepperButton,
  Toggle,
  PrimaryCta,
  ShakeWrap,
} from '@/components/blast/form/form-controls';
import { saveBlastDraft } from '@/lib/storage/blast-draft';
import { getDateParser, NLP_CONFIDENCE_CUTOFF } from '@/lib/blast/date-parser';
import type { ValidatedAddress } from '@/lib/db/types';
import type { BlastDraft, GenderOption, GenderPreference } from '@/lib/blast/types';

// ─── Step types ─────────────────────────────────────────────────────────────

type StepId =
  | 'pickup'
  | 'dropoff'
  | 'trip_type'
  | 'datetime'
  | 'storage'
  | 'price'
  | 'driver_pref'
  | 'rider_gender';

const STEPS: ReadonlyArray<StepId> = [
  'pickup',
  'dropoff',
  'trip_type',
  'datetime',
  'storage',
  'price',
  'driver_pref',
  'rider_gender',
];

const STEP_TITLES: Record<StepId, string> = {
  pickup: 'Where you at?',
  dropoff: 'Where to?',
  trip_type: 'One way or round trip?',
  datetime: 'When you trying to roll?',
  storage: 'Bringing bags?',
  price: 'What you paying?',
  driver_pref: 'Driver preference',
  rider_gender: 'About you',
};

const DEFAULT_PRICE_DOLLARS = 25;

// Internal form draft mirrors BlastDraft (lib/blast/types.ts) but lets pickup/
// dropoff start as null. saveBlastDraft validates the canonical shape.
interface FormDraft {
  pickup: ValidatedAddress | null;
  dropoff: ValidatedAddress | null;
  tripType: 'one_way' | 'round_trip';
  scheduledFor: string | null;
  scheduledFreeText: string;       // free text the user typed for the LLM parser
  nlpConfidence: number | null;
  storage: boolean;
  priceDollars: number;
  riderGender: GenderOption | null;
  driverPreference: GenderPreference;
}

const EMPTY_DRAFT: FormDraft = {
  pickup: null,
  dropoff: null,
  tripType: 'one_way',
  scheduledFor: null,
  scheduledFreeText: '',
  nlpConfidence: null,
  storage: false,
  priceDollars: DEFAULT_PRICE_DOLLARS,
  riderGender: null,
  driverPreference: { preferred: [], strict: false },
};

const stepSlideVariants = {
  enter: { x: 60, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -60, opacity: 0 },
};
const stepSlideTransition = { duration: 0.28, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

// ─── Component ──────────────────────────────────────────────────────────────

export default function BlastFormClient() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const prefersReduced = useReducedMotion();

  const [open, setOpen] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<FormDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  // Pricing estimate fetched once both addresses are set. distanceMi feeds the
  // price-step sublabel ("~3.2 mi · ~3 min"); suggestedPriceDollars replaces
  // the static $25 default if the rider hasn't manually adjusted yet.
  const [estimate, setEstimate] = useState<{
    distanceMi: number;
    estimatedMinutes: number;
    suggestedPriceDollars: number;
  } | null>(null);
  const priceTouchedRef = useRef(false);
  const startedAt = useRef<number>(Date.now());
  const startedRef = useRef(false);

  const step: StepId = STEPS[stepIdx];

  // Fire blast_form_started exactly once on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      posthog.capture('blast_form_started', { source: 'direct' });
    } catch { /* ignore */ }
  }, []);

  // Abandonment beacon if the user navigates away without completing.
  useEffect(() => {
    const handler = () => {
      if (submitting) return; // they did finish
      try {
        posthog.capture('blast_form_abandoned', {
          lastStep: STEPS[stepIdx],
          durationMs: Date.now() - startedAt.current,
        });
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
    // intentionally re-bind on stepIdx so the latest step is reported
  }, [stepIdx, submitting]);

  // Fetch the pricing estimate once both addresses are set. Re-fires whenever
  // either coordinate changes so a rider who edits an address gets a fresh
  // quote. If the rider hasn't moved the +/- stepper yet, we adopt the
  // suggested fare as the new default — otherwise we leave their choice alone
  // and only refresh the distance/duration sublabel.
  useEffect(() => {
    const p = draft.pickup;
    const d = draft.dropoff;
    if (!p || !d) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/blast/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickup: { lat: p.latitude, lng: p.longitude },
            dropoff: { lat: d.latitude, lng: d.longitude },
          }),
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          distance_mi: number;
          estimated_minutes: number;
          suggested_price_dollars: number;
        };
        if (cancelled) return;
        setEstimate({
          distanceMi: body.distance_mi,
          estimatedMinutes: body.estimated_minutes,
          suggestedPriceDollars: body.suggested_price_dollars,
        });
        if (!priceTouchedRef.current) {
          setDraft((cur) => ({ ...cur, priceDollars: body.suggested_price_dollars }));
        }
      } catch {
        // Estimate is best-effort — failure leaves the default $25 in place
        // and the sublabel hidden. Rider can still complete the form.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.pickup, draft.dropoff]);

  // Closing the sheet returns the user to /blast — there's no half-state we
  // want to keep them on.
  const handleClose = useCallback(() => {
    setOpen(false);
    // Allow the close animation to play before navigating away.
    window.setTimeout(() => router.push('/blast'), 320);
  }, [router]);

  // ─── Per-step validation ──────────────────────────────────────────────────

  const isStepValid = useCallback((id: StepId, d: FormDraft): boolean => {
    switch (id) {
      case 'pickup': return !!d.pickup;
      case 'dropoff': return !!d.dropoff;
      case 'trip_type': return d.tripType === 'one_way' || d.tripType === 'round_trip';
      case 'datetime': return true; // null means "ASAP" — always valid
      case 'storage': return true;  // boolean is always valid
      case 'price': return d.priceDollars >= 1 && d.priceDollars <= 500;
      case 'driver_pref': return true; // empty preferred is "no preference" — valid
      // About You is now mandatory — drivers honor the rider's stated
      // gender preference, so we need this for matching to work.
      case 'rider_gender': return d.riderGender === 'woman' || d.riderGender === 'man' || d.riderGender === 'nonbinary';
    }
  }, []);

  const advance = useCallback(() => {
    const valid = isStepValid(step, draft);
    if (!valid) {
      setShakeKey((k) => k + 1);
      return;
    }
    try {
      posthog.capture('blast_form_step_completed', {
        step,
        stepIndex: stepIdx,
      });
    } catch { /* ignore */ }
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      void submit();
    }
    // submit is defined below — eslint is fine with it bc of the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, stepIdx, draft, isStepValid]);

  const back = useCallback(() => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    else handleClose();
  }, [stepIdx, handleClose]);

  // ─── Submit: park draft, route to handoff ─────────────────────────────────

  const submit = useCallback(async () => {
    if (submitting) return;
    if (!draft.pickup || !draft.dropoff) {
      setStepIdx(draft.pickup ? 1 : 0);
      setShakeKey((k) => k + 1);
      return;
    }
    setSubmitting(true);
    const blastDraft: BlastDraft = {
      pickup: {
        lat: draft.pickup.latitude,
        lng: draft.pickup.longitude,
        address: draft.pickup.address || draft.pickup.name,
        mapboxId: draft.pickup.mapbox_id,
      },
      dropoff: {
        lat: draft.dropoff.latitude,
        lng: draft.dropoff.longitude,
        address: draft.dropoff.address || draft.dropoff.name,
        mapboxId: draft.dropoff.mapbox_id,
      },
      tripType: draft.tripType,
      scheduledFor: draft.scheduledFor,
      storage: draft.storage,
      priceDollars: draft.priceDollars,
      riderGender: draft.riderGender,
      driverPreference: draft.driverPreference,
      parsedFromText: draft.scheduledFreeText || undefined,
      nlpConfidence: draft.nlpConfidence ?? undefined,
      draftCreatedAt: Date.now(),
    };
    saveBlastDraft(blastDraft);

    // Auth-aware routing per spec:
    // - Unauth: send through Clerk's sign-up; afterwards Clerk hands back
    //   to /auth-callback/blast (?mode=signup default).
    // - Auth: skip Clerk entirely; go directly to handoff in signin mode
    //   so the username + photo steps are bypassed.
    if (isLoaded && isSignedIn) {
      router.push('/auth-callback/blast?mode=signin');
    } else {
      const returnTo = encodeURIComponent('/auth-callback/blast');
      router.push(`/sign-up?type=rider&draft=blast&returnTo=${returnTo}`);
    }
  }, [draft, isLoaded, isSignedIn, router, submitting]);

  // ─── Render step body ─────────────────────────────────────────────────────

  const renderStepBody = () => {
    switch (step) {
      case 'pickup':
        return (
          <PickupOrDropoffStep
            label="Pickup address"
            value={draft.pickup}
            onSelect={(addr) => {
              setDraft((d) => ({ ...d, pickup: addr }));
              // Auto-advance after a brief pause so the checkmark is seen.
              window.setTimeout(() => setStepIdx((i) => Math.max(i, 1)), 350);
            }}
          />
        );
      case 'dropoff':
        return (
          <PickupOrDropoffStep
            label="Dropoff address"
            value={draft.dropoff}
            onSelect={(addr) => {
              setDraft((d) => ({ ...d, dropoff: addr }));
              window.setTimeout(() => setStepIdx((i) => Math.max(i, 2)), 350);
            }}
          />
        );
      case 'trip_type':
        return (
          <ChipGroup
            ariaLabel="Trip type"
            options={[
              { value: 'one_way', label: 'One way' },
              { value: 'round_trip', label: 'Round trip' },
            ]}
            value={draft.tripType}
            onChange={(v) => setDraft((d) => ({ ...d, tripType: v as 'one_way' | 'round_trip' }))}
          />
        );
      case 'datetime':
        return (
          <DatetimeStep
            freeText={draft.scheduledFreeText}
            scheduledFor={draft.scheduledFor}
            onChange={(scheduledFor, freeText, confidence) =>
              setDraft((d) => ({ ...d, scheduledFor, scheduledFreeText: freeText, nlpConfidence: confidence ?? null }))
            }
          />
        );
      case 'storage':
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Bringing bags?</div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Groceries, luggage, anything bigger than a backpack. Drivers see this.
              </div>
            </div>
            <Toggle
              ariaLabel="Bringing storage"
              value={draft.storage}
              onChange={(next) => setDraft((d) => ({ ...d, storage: next }))}
            />
          </div>
        );
      case 'price':
        return (
          <PriceStep
            value={draft.priceDollars}
            distanceMi={estimate?.distanceMi ?? null}
            estimatedMinutes={estimate?.estimatedMinutes ?? null}
            onChange={(next) => {
              priceTouchedRef.current = true;
              setDraft((d) => ({ ...d, priceDollars: next }));
            }}
          />
        );
      case 'driver_pref':
        return (
          <DriverPrefStep
            value={draft.driverPreference}
            onChange={(next) => setDraft((d) => ({ ...d, driverPreference: next }))}
          />
        );
      case 'rider_gender':
        return (
          <div>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 12px' }}>
              So your driver knows who&rsquo;s pulling up. Required — drivers honor
              this when they pick.
            </p>
            <ChipGroup
              ariaLabel="Your gender"
              options={[
                { value: 'woman', label: 'Woman' },
                { value: 'man', label: 'Man' },
                // Stored as 'nonbinary' for back-compat with the rest of the
                // schema; surfaced to the rider as "Neither" per UX spec.
                { value: 'nonbinary', label: 'Neither' },
              ]}
              value={draft.riderGender ?? ('' as GenderOption)}
              onChange={(v) => setDraft((d) => ({ ...d, riderGender: v as GenderOption }))}
            />
          </div>
        );
    }
  };

  const ctaLabel = step === 'rider_gender' ? (submitting ? 'Notifying…' : 'Notify Drivers') : 'Continue';
  const stepValid = isStepValid(step, draft);

  // Reduced motion: skip the slide variant.
  const slideVariants = prefersReduced
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : stepSlideVariants;

  return (
    <BottomSheet open={open} onClose={handleClose} ariaLabel="Send a blast">
      <div
        style={{
          padding: '4px 20px 24px',
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Step header */}
        <header style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <button
              type="button"
              onClick={back}
              aria-label={stepIdx === 0 ? 'Close' : 'Back'}
              style={{
                width: 32, height: 32, borderRadius: 8, border: 'none',
                background: 'transparent', color: '#fff', fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {stepIdx === 0 ? '×' : '←'}
            </button>
            <ProgressDots count={STEPS.length} active={stepIdx} />
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: '#fff',
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              letterSpacing: 0.2,
            }}
          >
            {STEP_TITLES[step]}
          </h2>
        </header>

        {/* Step body — primary input above-the-fold per §5.1 */}
        <div style={{ flex: 1, minHeight: 240 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepSlideTransition}
            >
              <ShakeWrap shake={shakeKey > 0 && false /* triggered below per render */}>
                {renderStepBody()}
              </ShakeWrap>
              {/* Re-render shake on key bumps */}
              {shakeKey > 0 && (
                <motion.div
                  key={`shake-${shakeKey}`}
                  initial={{ x: 0 }}
                  animate={{ x: prefersReduced ? 0 : [0, -4, 4, -4, 4, 0] }}
                  transition={{ duration: 0.25 }}
                  aria-hidden
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer CTA */}
        <div style={{ paddingTop: 16 }}>
          <PrimaryCta
            onClick={advance}
            disabled={!stepValid}
            loading={submitting}
            pulse={step === 'rider_gender' && stepValid}
          >
            {ctaLabel}
          </PrimaryCta>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── ProgressDots ───────────────────────────────────────────────────────────

function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, flex: 1 }} aria-label={`Step ${active + 1} of ${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: i <= active ? '#00E676' : 'rgba(255,255,255,0.12)',
            transition: 'background-color 200ms ease',
          }}
        />
      ))}
    </div>
  );
}

// ─── Pickup / Dropoff ───────────────────────────────────────────────────────

function PickupOrDropoffStep({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: ValidatedAddress | null;
  onSelect: (addr: ValidatedAddress) => void;
}) {
  return (
    <div>
      <AddressAutocomplete
        label={label}
        value={value}
        onSelect={onSelect}
        required
      />
      {value && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#00E676',
            fontSize: 13,
          }}
        >
          <SuccessCheckmark size={20} autoHide={false} />
          Got it. Tap Continue.
        </motion.div>
      )}
    </div>
  );
}

// ─── Datetime step ──────────────────────────────────────────────────────────

function DatetimeStep({
  freeText,
  scheduledFor,
  onChange,
}: {
  freeText: string;
  scheduledFor: string | null;
  onChange: (scheduledFor: string | null, freeText: string, confidence: number | null) => void;
}) {
  const [text, setText] = useState(freeText);
  const [parsing, setParsing] = useState(false);
  const [parserStatus, setParserStatus] = useState<'idle' | 'parsed' | 'low_conf' | 'failed'>('idle');
  const parserRef = useRef(getDateParser());
  const debounceRef = useRef<number | null>(null);

  // Debounced LLM parse on text change. Per D-4 the threshold is 0.9; below
  // we keep null and surface chips. Per spec the parser self-degrades to chips
  // on 501 / timeout / network — we just translate that to UI.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!text || text.trim().length < 3) {
      setParserStatus('idle');
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setParsing(true);
      try {
        const result = await parserRef.current.parse(text);
        if (result.scheduledFor && result.confidence >= NLP_CONFIDENCE_CUTOFF) {
          onChange(result.scheduledFor.toISOString(), text, result.confidence);
          setParserStatus('parsed');
        } else if (result.scheduledFor) {
          // Got a parse but not confident enough — keep the value as null
          // and let chips be the canonical source.
          setParserStatus('low_conf');
          onChange(null, text, result.confidence);
        } else {
          setParserStatus('failed');
          onChange(null, text, null);
        }
        try {
          posthog.capture('blast_nlp_parsed', {
            confidence: result.confidence,
            fallbackUsed: result.confidence < NLP_CONFIDENCE_CUTOFF,
          });
        } catch { /* ignore */ }
      } finally {
        setParsing(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [text, onChange]);

  // Chip times are sensible defaults (Tonight = 8pm tonight, Tomorrow = 9am
  // tomorrow); labels stay terse per UX spec. A rider who wants a precise
  // time uses the free-text input above or the "Pick date" picker below.
  const presetChips = useMemo<{ value: string; label: string; iso: string | null }[]>(() => {
    const now = new Date();
    const tonight = new Date(now);
    tonight.setHours(20, 0, 0, 0);
    if (tonight.getTime() < now.getTime()) tonight.setDate(tonight.getDate() + 1);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return [
      { value: 'now', label: 'Now', iso: null },
      { value: 'tonight', label: 'Tonight', iso: tonight.toISOString() },
      { value: 'tomorrow', label: 'Tomorrow', iso: tomorrow.toISOString() },
    ];
  }, []);

  return (
    <div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Try "tonight 8pm" or pick below'
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 12,
          border: '1.5px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
          color: '#fff',
          fontSize: 16,
          outline: 'none',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}
      />
      <div style={{ minHeight: 18, marginTop: 8, fontSize: 12, color: '#888' }}>
        {parsing && 'Reading that…'}
        {!parsing && parserStatus === 'parsed' && scheduledFor && (
          <span style={{ color: '#00E676' }}>
            {new Date(scheduledFor).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
        {!parsing && parserStatus === 'low_conf' && (
          <span style={{ color: '#FFB300' }}>Not sure — pick a chip below to confirm.</span>
        )}
        {!parsing && parserStatus === 'failed' && (
          <span>Couldn&rsquo;t read that — pick below.</span>
        )}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {presetChips.map((p) => (
          <Chip
            key={p.value}
            active={scheduledFor === p.iso || (p.iso === null && scheduledFor === null && parserStatus === 'idle' && !text)}
            onClick={() => {
              setText('');
              setParserStatus('idle');
              onChange(p.iso, '', null);
            }}
          >
            {p.label}
          </Chip>
        ))}
        {/* Native picker chip. The prior implementation relayed through a
            separate hidden input via showPicker() — which silently failed on
            iOS Safari because the input was pointer-events:none / height:0
            (not focusable) and showPicker() requires a focusable element +
            user activation in the same call stack. Wrapping the input in a
            <label> styled like a chip lets the tap land directly on the input
            so the native picker opens reliably across iOS, Android, and
            desktop. showPicker() is called as a belt-and-suspenders fallback
            for desktop browsers that don't auto-open on click. */}
        <label
          htmlFor="blast-pick-date"
          onClick={() => {
            // Best-effort — user activation is fresh inside this click handler.
            // Wrapped in try/catch because Safari throws NotAllowedError if it
            // disagrees about user gesture, which we can safely ignore — the
            // label-wrapped input's native click already opens the picker on
            // browsers that need it.
            const el = document.getElementById('blast-pick-date') as HTMLInputElement | null;
            try { el?.showPicker?.(); } catch { /* ignore */ }
          }}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '12px 14px',
            borderRadius: 14,
            border: '1.5px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.78)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          Pick date
          <input
            id="blast-pick-date"
            type="datetime-local"
            min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
            onChange={(e) => {
              const t = new Date(e.target.value);
              if (Number.isFinite(t.getTime())) onChange(t.toISOString(), '', null);
            }}
            // Cover the entire chip so any tap inside the chip lands on the
            // input — that's the gesture that opens the native picker on iOS
            // Safari + Android Chrome. opacity:0 hides the native field UI
            // (which would otherwise render its own visible text on iOS).
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
        </label>
      </div>
    </div>
  );
}

// ─── Price step ─────────────────────────────────────────────────────────────

function PriceStep({
  value,
  distanceMi,
  estimatedMinutes,
  onChange,
}: {
  value: number;
  distanceMi: number | null;
  estimatedMinutes: number | null;
  onChange: (v: number) => void;
}) {
  const milesLabel =
    distanceMi != null && estimatedMinutes != null
      ? `${distanceMi.toFixed(1)} mi · ~${estimatedMinutes} min`
      : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <PriceStepperButton direction="-" onClick={() => onChange(Math.max(1, value - 5))} />
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 56,
            color: '#fff',
            lineHeight: 1,
          }}
        >
          $<CountUpNumber value={value} />
        </div>
        {milesLabel && (
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.6)',
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {milesLabel}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          Drivers see this. They can counter.
        </div>
      </div>
      <PriceStepperButton direction="+" onClick={() => onChange(value + 5)} />
    </div>
  );
}

// ─── Driver pref step ───────────────────────────────────────────────────────
// Single-select: Woman / Man / No Preference. The strict toggle stays in
// the schema (GenderPreference.strict) but is only revealed when the rider
// picks Woman or Man — "No Preference" hides it since strict-on-anyone is
// nonsensical. Persists into the existing `{ preferred: GenderOption[],
// strict: boolean }` shape so downstream matching code doesn't change.

function DriverPrefStep({
  value,
  onChange,
}: {
  value: GenderPreference;
  onChange: (v: GenderPreference) => void;
}) {
  // Map the JSON-shape preferred-array to a single-select state for the UI.
  // We treat any non-empty preferred as the first element's gender; "none"
  // means the rider hasn't expressed a preference.
  type Pick = 'woman' | 'man' | 'none';
  const current: Pick =
    value.preferred.includes('woman') ? 'woman' :
    value.preferred.includes('man') ? 'man' :
    'none';

  const pick = (next: Pick) => {
    if (next === 'none') {
      onChange({ preferred: [], strict: false });
    } else {
      onChange({ preferred: [next as GenderOption], strict: value.strict });
    }
  };

  const showStrict = current === 'woman' || current === 'man';
  const strictLabel =
    current === 'woman' ? 'Only women drivers' :
    current === 'man' ? 'Only men drivers' :
    '';

  return (
    <div>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 12px' }}>
        Pick who you&rsquo;d prefer driving you. No preference = anyone close.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip active={current === 'woman'} onClick={() => pick('woman')}>Woman</Chip>
        <Chip active={current === 'man'} onClick={() => pick('man')}>Man</Chip>
        <Chip active={current === 'none'} onClick={() => pick('none')}>No preference</Chip>
      </div>
      {showStrict && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{strictLabel}</div>
            <div style={{ fontSize: 12, color: '#888' }}>
              Hard filter — we won&rsquo;t send your blast to anyone else.
            </div>
          </div>
          <Toggle
            ariaLabel="Strict gender preference"
            value={value.strict}
            onChange={(strict) => onChange({ ...value, strict })}
          />
        </div>
      )}
    </div>
  );
}
