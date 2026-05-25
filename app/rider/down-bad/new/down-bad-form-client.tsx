'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AddressAutocomplete } from '@/components/ride/address-autocomplete';
import DownBadMediaUpload, { type DownBadMediaResult } from '@/components/down-bad/down-bad-media-upload';
import type { ValidatedAddress } from '@/lib/db/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type StepId = 'pickup' | 'dropoff' | 'deposit' | 'details' | 'sum_extra';
type Luggage = 'none' | 'bag' | 'trunk';

const STEPS: StepId[] = ['pickup', 'dropoff', 'deposit', 'details', 'sum_extra'];

const STEP_TITLES: Record<StepId, string> = {
  pickup: 'Where you at?',
  dropoff: 'Where to?',
  deposit: 'How much you putting up?',
  details: 'Any extra details?',
  sum_extra: `What's the "Sum' Extra?"`,
};

const MAX_NUMERIC_CHARS = 4;

// Strip emoji variation selectors + keycap combiners before counting
// so that 1️⃣ exposes its underlying digit character.
function normalizeSumText(s: string): string {
  return s.replace(/[️⃣]/g, '');
}

// Counts ALL Unicode numeric characters (ASCII digits, keycap digits,
// circled digits ①②, Arabic-Indic numerals, etc.) via \p{N}.
function countNumeric(s: string): number {
  return [...normalizeSumText(s)].filter(ch => /\p{N}/u.test(ch)).length;
}

// Emoji-safe character count (by code point, not UTF-16 units).
function countCodePoints(s: string): number {
  return [...s].length;
}

interface FormDraft {
  pickup: ValidatedAddress | null;
  dropoff: ValidatedAddress | null;
  depositDollars: number;
  additionalPassengers: number;
  kids: number;
  luggage: Luggage;
  sumExtraText: string;
  sumExtraMedia: DownBadMediaResult | null;
}

interface DownBadRemoteConfig {
  enabled: boolean;
  cashFloorCents: number;
  cashCeilingCents: number;
  sumExtraMaxChars: number;
  requireMinRides: number;
  requireMinChillScore: number;
  disclaimerText: string;
}

const DEFAULT_CONFIG: DownBadRemoteConfig = {
  enabled: false,
  cashFloorCents: 500,
  cashCeilingCents: 3000,
  sumExtraMaxChars: 60,
  requireMinRides: 0,
  requireMinChillScore: 0,
  disclaimerText: '',
};

const slide = {
  enter: { x: 50, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -50, opacity: 0 },
};
const trans = { duration: 0.24, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

// ── Component ──────────────────────────────────────────────────────────────────

export default function DownBadFormClient({ targetDriverHandle }: { targetDriverHandle?: string | null }) {
  const router = useRouter();

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const [draft, setDraft] = useState<FormDraft>({
    pickup: null,
    dropoff: null,
    depositDollars: 10,
    additionalPassengers: 0,
    kids: 0,
    luggage: 'none',
    sumExtraText: '',
    sumExtraMedia: null,
  });

  const [config, setConfig] = useState<DownBadRemoteConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    fetch('/api/rider/down-bad-config')
      .then(r => r.json())
      .then((d: DownBadRemoteConfig) => {
        setConfig(d);
        // Snap deposit to floor if default is below it
        const floorDollars = Math.ceil(d.cashFloorCents / 100);
        setDraft(prev => ({
          ...prev,
          depositDollars: Math.max(prev.depositDollars, floorDollars),
        }));
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, []);

  const floorDollars = Math.ceil(config.cashFloorCents / 100);
  const ceilingDollars = Math.floor(config.cashCeilingCents / 100);

  // ── Validation ─────────────────────────────────────────────────────────────

  const isValid = useCallback((id: StepId): boolean => {
    switch (id) {
      case 'pickup': return !!draft.pickup;
      case 'dropoff': return !!draft.dropoff;
      case 'deposit':
        return draft.depositDollars >= floorDollars && draft.depositDollars <= ceilingDollars;
      case 'details': return true; // always valid — optional step
      case 'sum_extra':
        return (
          draft.sumExtraText.trim().length > 0 &&
          countCodePoints(draft.sumExtraText) <= config.sumExtraMaxChars &&
          countNumeric(draft.sumExtraText) <= MAX_NUMERIC_CHARS &&
          !!draft.sumExtraMedia
        );
    }
  }, [draft, floorDollars, ceilingDollars, config.sumExtraMaxChars]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const advance = useCallback(() => {
    if (!isValid(step)) {
      setShakeKey(k => k + 1);
      if (step === 'sum_extra' && !draft.sumExtraMedia) {
        setError('Upload a photo or video before posting.');
      } else if (step === 'sum_extra' && !draft.sumExtraText.trim()) {
        setError('Describe the sum extra before posting.');
      }
      return;
    }
    setError('');
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      // Last step — show disclaimer before submit
      if (!disclaimerAccepted) { setShowDisclaimer(true); return; }
      void submit();
    }
  }, [isValid, step, stepIdx, disclaimerAccepted, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = useCallback(() => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    else router.back();
  }, [stepIdx, router]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const submit = useCallback(async () => {
    if (submitting) return;
    if (!draft.pickup) { setError('Pickup location is missing.'); return; }
    if (!draft.dropoff) { setError('Dropoff location is missing.'); return; }
    if (!draft.sumExtraMedia) { setError('Upload a photo or video first.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const hasDetails = draft.additionalPassengers > 0 || draft.kids > 0 || draft.luggage !== 'none';
      const res = await fetch('/api/rider/down-bad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_lat: draft.pickup.latitude,
          pickup_lng: draft.pickup.longitude,
          pickup_address: draft.pickup.address || draft.pickup.name,
          dropoff_lat: draft.dropoff.latitude,
          dropoff_lng: draft.dropoff.longitude,
          dropoff_address: draft.dropoff.address || draft.dropoff.name,
          price: draft.depositDollars,
          ride_details: hasDetails
            ? { additionalPassengers: draft.additionalPassengers, kids: draft.kids, luggage: draft.luggage }
            : null,
          sum_extra_text: draft.sumExtraText.trim(),
          sum_extra_media_url: draft.sumExtraMedia.mediaUrl,
          sum_extra_media_type: draft.sumExtraMedia.mediaType,
          sum_extra_poster_url: draft.sumExtraMedia.posterUrl ?? null,
          scheduled_for: null,
          target_driver_handle: targetDriverHandle ?? null,
        }),
      });

      if (res.ok) {
        const { postId } = await res.json() as { postId: string };
        router.push(`/rider/down-bad/${postId}/status`);
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setError(b.error || 'Something went wrong. Try again.');
        setSubmitting(false);
      }
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }, [draft, submitting, router]);

  // ── Step body ──────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      case 'pickup':
      case 'dropoff': {
        const isPickup = step === 'pickup';
        return (
          <div style={{ padding: '0 20px 24px' }}>
            <AddressAutocomplete
              label={isPickup ? 'Pickup' : 'Dropoff'}
              placeholder={isPickup ? 'Your pickup address or spot' : 'Where are you going?'}
              onSelect={(addr) =>
                setDraft(d => ({ ...d, [isPickup ? 'pickup' : 'dropoff']: addr }))
              }
              value={isPickup ? draft.pickup : draft.dropoff}
            />
          </div>
        );
      }

      case 'deposit': {
        return (
          <div style={{ padding: '0 20px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
              Cash deposit you&apos;re offering — held at match, paid at pickup.
              Between ${floorDollars}–${ceilingDollars}.
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
            }}>
              <button
                type="button"
                onClick={() => setDraft(d => ({ ...d, depositDollars: Math.max(floorDollars, d.depositDollars - 5) }))}
                style={stepperBtnStyle}
              >
                −
              </button>
              <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', minWidth: 100 }}>
                ${draft.depositDollars}
              </div>
              <button
                type="button"
                onClick={() => setDraft(d => ({ ...d, depositDollars: Math.min(ceilingDollars, d.depositDollars + 5) }))}
                style={stepperBtnStyle}
              >
                +
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 16 }}>
              + sum extra in person at pickup
            </div>
          </div>
        );
      }

      case 'details': {
        return (
          <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ fontSize: 13, color: '#888' }}>
              Optional — help your driver know what to expect before accepting.
            </div>

            {/* Additional passengers */}
            <div>
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12, fontWeight: 600 }}>
                Additional passengers
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
                Not counting yourself
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <button
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, additionalPassengers: Math.max(0, d.additionalPassengers - 1) }))}
                  style={stepperBtnStyle}
                  disabled={draft.additionalPassengers === 0}
                >
                  −
                </button>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', minWidth: 48, textAlign: 'center' }}>
                  {draft.additionalPassengers}
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, additionalPassengers: Math.min(4, d.additionalPassengers + 1) }))}
                  style={stepperBtnStyle}
                  disabled={draft.additionalPassengers === 4}
                >
                  +
                </button>
              </div>
            </div>

            {/* Kids / car seats */}
            <div>
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12, fontWeight: 600 }}>
                Kids needing car seats
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <button
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, kids: Math.max(0, d.kids - 1) }))}
                  style={stepperBtnStyle}
                  disabled={draft.kids === 0}
                >
                  −
                </button>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', minWidth: 48, textAlign: 'center' }}>
                  {draft.kids}
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, kids: Math.min(3, d.kids + 1) }))}
                  style={stepperBtnStyle}
                  disabled={draft.kids === 3}
                >
                  +
                </button>
              </div>
              {draft.kids > 0 && (
                <div style={{ fontSize: 12, color: '#00E676', marginTop: 8 }}>
                  Driver will see: {draft.kids} car seat{draft.kids > 1 ? 's' : ''} needed
                </div>
              )}
            </div>

            {/* Luggage */}
            <div>
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12, fontWeight: 600 }}>
                Luggage / trunk space
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['none', 'bag', 'trunk'] as Luggage[]).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, luggage: opt }))}
                    style={{
                      flex: 1, padding: '10px 0',
                      borderRadius: 100,
                      border: `1.5px solid ${draft.luggage === opt ? '#00E676' : '#2a2a2a'}`,
                      background: draft.luggage === opt ? 'rgba(0,230,118,0.1)' : '#111',
                      color: draft.luggage === opt ? '#00E676' : '#888',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                      transition: 'all 0.15s',
                    }}
                  >
                    {opt === 'none' ? 'None' : opt === 'bag' ? '🎒 Bag' : '📦 Trunk'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'sum_extra': {
        const codePointsUsed = countCodePoints(draft.sumExtraText);
        const charsLeft = config.sumExtraMaxChars - codePointsUsed;
        const digitsUsed = countNumeric(draft.sumExtraText);
        const digitsLeft = MAX_NUMERIC_CHARS - digitsUsed;
        return (
          <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
                What are you offering? Be specific — your driver needs to know what to expect.
              </div>
              <textarea
                value={draft.sumExtraText}
                onChange={e => {
                  const next = e.target.value;
                  if (countNumeric(next) > MAX_NUMERIC_CHARS) return;
                  setDraft(d => ({ ...d, sumExtraText: next }));
                }}
                rows={3}
                placeholder='e.g. "bag of wings from the spot on Edgewood"'
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#111', border: '1.5px solid #2a2a2a',
                  borderRadius: 12, padding: '14px 16px',
                  fontSize: 15, color: '#fff',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                  resize: 'none', outline: 'none',
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontSize: 11, color: digitsLeft === 0 ? '#FFC107' : '#555' }}>
                  {digitsLeft === 0 ? 'No more numbers allowed' : `${digitsLeft} number${digitsLeft === 1 ? '' : 's'} left`}
                </div>
                <div style={{ fontSize: 11, color: charsLeft < 15 ? '#FFC107' : '#555' }}>
                  {charsLeft} left
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
                Show it — photo or video required to post.
              </div>
              <DownBadMediaUpload
                value={draft.sumExtraMedia}
                onUpload={(result) => setDraft(d => ({ ...d, sumExtraMedia: result }))}
              />
            </div>
          </div>
        );
      }
    }
  };

  // ── CTA label ──────────────────────────────────────────────────────────────

  const isLastStep = stepIdx === STEPS.length - 1;
  const ctaLabel = isLastStep
    ? (submitting ? 'Posting…' : 'Post It')
    : 'Continue';

  if (configLoaded && !config.enabled) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#080808', color: '#fff', padding: 32, paddingTop: 88, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😮‍💨</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Down Bad Coming Soon</div>
        <div style={{ fontSize: 14, color: '#888', maxWidth: 280 }}>
          We&apos;re still rolling this out. Check back soon.
        </div>
        <button
          onClick={() => router.back()}
          style={{ marginTop: 32, fontSize: 14, color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#080808', color: '#fff', display: 'flex', flexDirection: 'column', paddingTop: 56 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
        <button
          onClick={back}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 4 }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
            Down Bad · {stepIdx + 1}/{STEPS.length}
            {targetDriverHandle && (
              <span style={{
                marginLeft: 8, background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 100,
                padding: '2px 8px', fontSize: 10, letterSpacing: 0, textTransform: 'none',
                color: '#bbb',
              }}>
                @{targetDriverHandle}
              </span>
            )}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{STEP_TITLES[step]}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: '#1a1a1a', margin: '0 20px' }}>
        <div style={{
          height: '100%', background: '#fff',
          width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
          borderRadius: 1, transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Step body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 24 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={trans}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '0 20px 8px', fontSize: 13, color: '#FF8A8A', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* CTA */}
      <motion.div
        key={shakeKey}
        animate={shakeKey ? { x: [0, -8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.35 }}
        style={{ padding: '12px 20px 32px' }}
      >
        <button
          type="button"
          onClick={advance}
          disabled={submitting || !configLoaded}
          style={{
            width: '100%', padding: '16px 0',
            background: isValid(step) ? '#00E676' : '#1a1a1a',
            color: isValid(step) ? '#080808' : '#555',
            fontSize: 16, fontWeight: 800, borderRadius: 100,
            border: 'none', cursor: 'pointer',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {ctaLabel}
        </button>
        {step === 'details' && (
          <button
            type="button"
            onClick={() => { setError(''); setStepIdx(stepIdx + 1); }}
            style={{
              display: 'block', width: '100%', marginTop: 12,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#555', fontSize: 14,
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Skip →
          </button>
        )}
      </motion.div>

      {/* Disclaimer modal */}
      <AnimatePresence>
        {showDisclaimer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => setShowDisclaimer(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#111', borderRadius: '20px 20px 0 0',
                padding: '28px 20px 44px',
                width: '100%', maxWidth: 520,
              }}
            >
              <div style={{ width: 36, height: 4, background: '#333', borderRadius: 2, margin: '0 auto 24px' }} />

              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                Before you post
              </div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>
                Read this — tapping &quot;I&apos;m Down&quot; means you agree.
              </div>

              {config.disclaimerText ? (
                <div style={{
                  fontSize: 14, color: '#bbb', lineHeight: 1.65,
                  whiteSpace: 'pre-wrap', marginBottom: 28,
                  maxHeight: '38vh', overflowY: 'auto',
                }}>
                  {config.disclaimerText}
                </div>
              ) : (
                <div style={{ height: 60 }} />
              )}

              <button
                onClick={async () => {
                  setDisclaimerAccepted(true);
                  setShowDisclaimer(false);
                  await submit();
                }}
                disabled={submitting}
                style={{
                  width: '100%', padding: '15px 0',
                  background: submitting ? '#333' : '#00E676',
                  color: '#080808', fontWeight: 800, fontSize: 16,
                  borderRadius: 100, border: 'none', cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}
              >
                {submitting ? 'Posting…' : "I'm Down — Post It"}
              </button>
              <button
                onClick={() => setShowDisclaimer(false)}
                style={{
                  width: '100%', marginTop: 12, padding: '12px 0',
                  background: 'transparent', color: '#555', fontSize: 14,
                  border: 'none', cursor: 'pointer',
                  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                }}
              >
                Nah, let me re-read
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const stepperBtnStyle: React.CSSProperties = {
  width: 52, height: 52, borderRadius: '50%',
  background: '#1a1a1a', border: '1.5px solid #2a2a2a',
  color: '#fff', fontSize: 24, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};
