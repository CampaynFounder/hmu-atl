'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignUp, useSignIn, useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import CelebrationConfetti from '@/components/shared/celebration-confetti';

// ── Types ──────────────────────────────────────────────────────────────────

interface MapboxSuggestion {
  name: string;
  full_address: string;
  mapbox_id: string;
}

interface PointPick {
  lat: number;
  lng: number;
  address: string;
}

type Block = 'pickup' | 'dropoff' | 'trip_type' | 'when' | 'storage' | 'price' | 'driver_pref' | 'phone';
type Step = 'form' | 'otp' | 'name' | 'photo' | 'ready';

interface FormDraft {
  pickup: PointPick | null;
  dropoff: PointPick | null;
  trip_type: 'one_way' | 'round_trip';
  when: 'now' | 'in_1h' | 'tonight' | 'tomorrow_am' | 'custom';
  customWhen: string | null;
  storage: boolean;
  price: number | null;
  driver_pref: 'male' | 'female' | 'any';
  phone: string;
}

const DRAFT_KEY = 'blast_draft_v2';
const DRAFT_TTL_MS = 60 * 60 * 1000;

const EMPTY_DRAFT: FormDraft = {
  pickup: null,
  dropoff: null,
  trip_type: 'one_way',
  when: 'now',
  customWhen: null,
  storage: false,
  price: null,
  driver_pref: 'any',
  phone: '',
};

// Brand tokens — keep in sync with /app/layout.tsx + /components/shared/celebration-confetti
const BRAND = {
  green: '#00E676',
  bg: '#080808',
  card: '#141414',
  cardElev: '#1c1c1c',
  border: 'rgba(255,255,255,0.08)',
  borderActive: 'rgba(0,230,118,0.5)',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function newSessionToken(): string {
  return 'sess_' + crypto.randomUUID();
}

function loadDraft(): FormDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as { draft: FormDraft; savedAt: number };
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...parsed.draft };
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(d: FormDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: d, savedAt: Date.now() }));
  } catch { /* */ }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch { /* */ }
}

function whenToISO(d: FormDraft): string | null {
  const now = new Date();
  if (d.when === 'now') return null;
  if (d.when === 'in_1h') return new Date(now.getTime() + 60 * 60_000).toISOString();
  if (d.when === 'tonight') {
    const t = new Date(now);
    t.setHours(20, 0, 0, 0);
    if (t.getTime() < now.getTime() + 60 * 60_000) t.setDate(t.getDate() + 1);
    return t.toISOString();
  }
  if (d.when === 'tomorrow_am') {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t.toISOString();
  }
  if (d.when === 'custom' && d.customWhen) {
    const t = new Date(d.customWhen);
    return Number.isFinite(t.getTime()) ? t.toISOString() : null;
  }
  return null;
}

// Phone formatting — accepts (404) 555-1234, 4045551234, +14045551234, etc.
function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function toE164(input: string): string | null {
  const ten = normalizePhone(input);
  return ten.length === 10 ? `+1${ten}` : null;
}

function formatPhone(input: string): string {
  const d = normalizePhone(input);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

// Framer-motion shared transitions
const stepVariants = {
  enter: { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
};
const stepTransition = { duration: 0.32, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };

// ── Main component ─────────────────────────────────────────────────────────

export default function BlastFormClient() {
  const router = useRouter();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { isSignedIn } = useUser();

  const [step, setStep] = useState<Step>('form');
  const [draft, setDraft] = useState<FormDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [openBlock, setOpenBlock] = useState<Block | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{
    distance_mi: number;
    suggested_price_dollars: number;
    deposit_cents: number;
  } | null>(null);
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | null>(null);
  const [otpSendingState, setOtpSendingState] = useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [confetti, setConfetti] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const sessionToken = useRef<string>(newSessionToken());

  // ── Hydration + autosave ──
  useEffect(() => {
    setDraft(loadDraft());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) saveDraft(draft);
  }, [draft, hydrated]);

  // ── Live estimate ──
  useEffect(() => {
    if (!draft.pickup || !draft.dropoff) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    fetch('/api/blast/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup: { lat: draft.pickup.lat, lng: draft.pickup.lng },
        dropoff: { lat: draft.dropoff.lat, lng: draft.dropoff.lng },
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setEstimate(data);
        setDraft((d) => (d.price == null ? { ...d, price: data.suggested_price_dollars } : d));
      })
      .finally(() => !cancelled && setEstimating(false));
    return () => {
      cancelled = true;
    };
  }, [draft.pickup, draft.dropoff]);

  const finalPrice = draft.price ?? estimate?.suggested_price_dollars ?? 25;
  const phoneE164 = toE164(draft.phone);
  const tripValid = !!(draft.pickup && draft.dropoff && finalPrice > 0);
  // Signed-in users don't need to re-enter a phone — they already verified one
  // when they signed up. Phone is only required for the OTP path.
  const formValid = tripValid && (isSignedIn || !!phoneE164);

  // ── Get Cash Ride: kick off OTP (or skip if already signed in) ──
  const handleGetCashRide = useCallback(async () => {
    // Already signed in — skip OTP and the phone field; bootstrap our DB row
    // and advance to whichever onboarding step is still missing.
    if (isSignedIn) {
      setOtpError(null);
      try {
        const r = await fetch('/api/blast/onboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: draft.phone }),
        });
        const body = (await r.json().catch(() => ({}))) as { hasDisplayName?: boolean; hasPhoto?: boolean };
        if (!body.hasDisplayName) setStep('name');
        else if (!body.hasPhoto) setStep('photo');
        else setStep('ready');
      } catch (e) {
        setOtpError(e instanceof Error ? e.message : 'Could not continue');
      }
      return;
    }

    if (!formValid || !signUpLoaded || !signInLoaded || !signUp || !signIn) return;
    setOtpError(null);
    setOtpSendingState('sending');
    try {
      // Try signup first; fall back to signin if phone already registered.
      try {
        await signUp.create({ phoneNumber: phoneE164! });
        await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
        setAuthMode('signup');
      } catch (err: unknown) {
        const errs = (err as { errors?: Array<{ code?: string; message?: string }> }).errors ?? [];
        const code = errs[0]?.code;
        if (code === 'form_identifier_exists' || code === 'form_phone_number_taken') {
          // Existing user — do sign-in instead.
          const created = await signIn.create({
            identifier: phoneE164!,
          });
          const phoneFactor = created.supportedFirstFactors?.find(
            (f: { strategy?: string }) => f.strategy === 'phone_code',
          ) as { phoneNumberId?: string } | undefined;
          if (!phoneFactor?.phoneNumberId) throw new Error('Phone factor unavailable');
          await signIn.prepareFirstFactor({
            strategy: 'phone_code',
            phoneNumberId: phoneFactor.phoneNumberId,
          });
          setAuthMode('signin');
        } else {
          throw err;
        }
      }
      setOtpSendingState('sent');
      setStep('otp');
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ??
        (err instanceof Error ? err.message : 'Could not send code');
      setOtpError(msg);
      setOtpSendingState('idle');
    }
  }, [formValid, signUpLoaded, signInLoaded, signUp, signIn, phoneE164]);

  // ── Verify OTP code ──
  const handleVerifyOtp = useCallback(
    async (code: string) => {
      if (!authMode) return;
      setOtpError(null);
      setOtpSendingState('verifying');
      try {
        if (authMode === 'signup' && signUp) {
          const result = await signUp.attemptPhoneNumberVerification({ code });
          if (result.status !== 'complete') throw new Error('Verification incomplete');
          await setSignUpActive({ session: result.createdSessionId });
        } else if (authMode === 'signin' && signIn) {
          const result = await signIn.attemptFirstFactor({ strategy: 'phone_code', code });
          if (result.status !== 'complete') throw new Error('Verification incomplete');
          await setSignInActive({ session: result.createdSessionId });
        }
        // Bootstrap our DB row immediately so the blast send doesn't 404.
        await fetch('/api/blast/onboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: draft.phone }),
        }).catch(() => {});
        setStep('name');
        setOtpSendingState('idle');
      } catch (err: unknown) {
        const msg =
          (err as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ??
          (err instanceof Error ? err.message : 'Wrong code — try again');
        setOtpError(msg);
        setOtpSendingState('sent');
      }
    },
    [authMode, signUp, signIn, setSignUpActive, setSignInActive, draft.phone],
  );

  const handleResendOtp = useCallback(async () => {
    if (!authMode) return;
    setOtpError(null);
    setOtpSendingState('sending');
    try {
      if (authMode === 'signup' && signUp) {
        await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
      } else if (authMode === 'signin' && signIn) {
        const phoneFactor = signIn.supportedFirstFactors?.find(
          (f: { strategy?: string }) => f.strategy === 'phone_code',
        ) as { phoneNumberId?: string } | undefined;
        if (phoneFactor?.phoneNumberId) {
          await signIn.prepareFirstFactor({
            strategy: 'phone_code',
            phoneNumberId: phoneFactor.phoneNumberId,
          });
        }
      }
      setOtpSendingState('sent');
    } catch {
      setOtpError('Could not resend');
      setOtpSendingState('sent');
    }
  }, [authMode, signUp, signIn]);

  // ── Save name ──
  const handleSaveName = useCallback(async () => {
    if (!displayName.trim()) return;
    await fetch('/api/blast/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName.trim(), phone: draft.phone }),
    }).catch(() => {});
    setConfetti(true);
    window.setTimeout(() => setConfetti(false), 3500);
    setStep('photo');
  }, [displayName, draft.phone]);

  // ── Photo upload callback ──
  const handlePhotoUploaded = useCallback(
    async (url: string) => {
      setAvatarUrl(url);
      await fetch('/api/blast/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: url }),
      }).catch(() => {});
      setStep('ready');
    },
    [],
  );

  // ── Get My Ride: fire the blast ──
  const handleGetMyRide = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup: { lat: draft.pickup!.lat, lng: draft.pickup!.lng, address: draft.pickup!.address },
          dropoff: { lat: draft.dropoff!.lat, lng: draft.dropoff!.lng, address: draft.dropoff!.address },
          trip_type: draft.trip_type,
          scheduled_for: whenToISO(draft),
          storage: draft.storage,
          driver_preference: draft.driver_pref,
          price_dollars: finalPrice,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        blastId?: string;
      };
      if (res.status === 412 && body.error === 'PAYMENT_METHOD_REQUIRED') {
        router.push('/rider/settings?tab=payment&from=blast');
        return;
      }
      if (!res.ok || !body.blastId) {
        setSubmitError(body.message || body.error || 'Could not send blast — try again.');
        setSubmitting(false);
        return;
      }
      clearDraft();
      router.push(`/rider/blast/${body.blastId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Network error');
      setSubmitting(false);
    }
  }, [submitting, draft, finalPrice, router]);

  return (
    <div
      className="min-h-screen text-white pb-32"
      style={{ background: BRAND.bg, fontFamily: 'var(--font-body)' }}
    >
      <CelebrationConfetti active={confetti} variant="cannon" />

      <Header step={step} onBack={() => step !== 'form' && setStep('form')} />

      <main className="px-3 pt-3">
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div
              key="form"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <FormStep
                draft={draft}
                setDraft={setDraft}
                openBlock={openBlock}
                setOpenBlock={setOpenBlock}
                estimate={estimate}
                estimating={estimating}
                finalPrice={finalPrice}
                tripValid={tripValid}
                formValid={formValid}
                isSignedIn={!!isSignedIn}
                onGetCashRide={handleGetCashRide}
                otpSendingState={otpSendingState}
                otpError={otpError}
                sessionToken={sessionToken.current}
              />
            </motion.div>
          )}

          {step === 'otp' && (
            <motion.div
              key="otp"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <OtpStep
                phone={draft.phone}
                onVerify={handleVerifyOtp}
                onResend={handleResendOtp}
                onBack={() => setStep('form')}
                state={otpSendingState}
                error={otpError}
              />
            </motion.div>
          )}

          {step === 'name' && (
            <motion.div
              key="name"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <NameStep
                value={displayName}
                onChange={setDisplayName}
                onContinue={handleSaveName}
              />
            </motion.div>
          )}

          {step === 'photo' && (
            <motion.div
              key="photo"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <PhotoStep
                displayName={displayName}
                photoUrl={avatarUrl}
                onUploaded={handlePhotoUploaded}
              />
            </motion.div>
          )}

          {step === 'ready' && (
            <motion.div
              key="ready"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <ReadyStep
                draft={draft}
                finalPrice={finalPrice}
                photoUrl={avatarUrl}
                onSend={handleGetMyRide}
                submitting={submitting}
                error={submitError}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

function Header({ step, onBack }: { step: Step; onBack: () => void }) {
  const STEP_TITLES: Record<Step, string> = {
    form: 'Find a Ride',
    otp: 'Verify your number',
    name: 'What should we call you?',
    photo: 'Snap a photo',
    ready: 'Ready to roll',
  };
  const showBack = step !== 'form' && step !== 'ready';
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl border-b"
      style={{
        background: 'rgba(8,8,8,0.85)',
        borderColor: BRAND.border,
      }}
    >
      <div className="px-4 py-4 flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack}
            className="text-neutral-400 hover:text-white text-base -ml-1 px-1"
            aria-label="Back"
          >
            ←
          </button>
        )}
        <div className="flex-1">
          <h1
            className="text-2xl tracking-tight leading-none"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {STEP_TITLES[step]}
          </h1>
          {step === 'form' && (
            <p className="text-xs text-neutral-400 mt-1">
              Tell drivers what you need. They&rsquo;ll HMU back.
            </p>
          )}
        </div>
        <StepBadge step={step} />
      </div>
    </header>
  );
}

function StepBadge({ step }: { step: Step }) {
  const order: Step[] = ['form', 'otp', 'name', 'photo', 'ready'];
  const idx = order.indexOf(step);
  return (
    <div className="flex gap-1">
      {order.map((s, i) => (
        <div
          key={s}
          className="w-6 h-1 rounded-full transition-colors duration-300"
          style={{
            background: i <= idx ? BRAND.green : 'rgba(255,255,255,0.1)',
          }}
        />
      ))}
    </div>
  );
}

// ── Form Step ──────────────────────────────────────────────────────────────

interface FormStepProps {
  draft: FormDraft;
  setDraft: React.Dispatch<React.SetStateAction<FormDraft>>;
  openBlock: Block | null;
  setOpenBlock: React.Dispatch<React.SetStateAction<Block | null>>;
  estimate: { distance_mi: number; suggested_price_dollars: number; deposit_cents: number } | null;
  estimating: boolean;
  finalPrice: number;
  tripValid: boolean;
  formValid: boolean;
  isSignedIn: boolean;
  otpSendingState: 'idle' | 'sending' | 'sent' | 'verifying';
  otpError: string | null;
  sessionToken: string;
  onGetCashRide: () => void;
}

function FormStep({
  draft,
  setDraft,
  openBlock,
  setOpenBlock,
  estimate,
  estimating,
  finalPrice,
  tripValid,
  formValid,
  isSignedIn,
  otpSendingState,
  otpError,
  sessionToken,
  onGetCashRide,
}: FormStepProps) {
  const tripTypeLabel = draft.trip_type === 'round_trip' ? 'Round trip' : 'One way';
  const whenLabel = useMemo(() => {
    if (draft.when === 'now') return 'Now';
    if (draft.when === 'in_1h') return 'In 1 hour';
    if (draft.when === 'tonight') return 'Tonight 8pm';
    if (draft.when === 'tomorrow_am') return 'Tomorrow morning';
    if (draft.when === 'custom' && draft.customWhen) return new Date(draft.customWhen).toLocaleString();
    return 'Pick a time';
  }, [draft.when, draft.customWhen]);

  return (
    <div className="space-y-2">
      {/* Stagger the cards in on first render for that premium feel */}
      <StaggerContainer>
        <Card
          label="Pickup"
          value={draft.pickup?.address ?? 'Where are you?'}
          filled={!!draft.pickup}
          open={openBlock === 'pickup'}
          onToggle={() => setOpenBlock(openBlock === 'pickup' ? null : 'pickup')}
        >
          <AddressInput
            sessionToken={sessionToken}
            onPick={(p) => {
              setDraft((d) => ({ ...d, pickup: p }));
              setOpenBlock('dropoff');
            }}
          />
        </Card>

        <Card
          label="Dropoff"
          value={draft.dropoff?.address ?? 'Where to?'}
          filled={!!draft.dropoff}
          open={openBlock === 'dropoff'}
          onToggle={() => setOpenBlock(openBlock === 'dropoff' ? null : 'dropoff')}
        >
          <AddressInput
            sessionToken={sessionToken}
            onPick={(p) => {
              setDraft((d) => ({ ...d, dropoff: p }));
              setOpenBlock('when');
            }}
          />
        </Card>

        <Card
          label="Trip type"
          value={tripTypeLabel}
          filled
          open={openBlock === 'trip_type'}
          onToggle={() => setOpenBlock(openBlock === 'trip_type' ? null : 'trip_type')}
        >
          <PillRow
            options={[
              ['one_way', 'One way'],
              ['round_trip', 'Round trip'],
            ]}
            value={draft.trip_type}
            onChange={(v) => {
              setDraft((d) => ({ ...d, trip_type: v as 'one_way' | 'round_trip' }));
              setOpenBlock(null);
            }}
          />
        </Card>

        <Card
          label="When"
          value={whenLabel}
          filled
          open={openBlock === 'when'}
          onToggle={() => setOpenBlock(openBlock === 'when' ? null : 'when')}
        >
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['now', 'Now'],
                ['in_1h', 'In 1 hour'],
                ['tonight', 'Tonight 8pm'],
                ['tomorrow_am', 'Tomorrow 9am'],
              ] as const
            ).map(([key, lab]) => (
              <Pill
                key={key}
                active={draft.when === key}
                onClick={() => {
                  setDraft((d) => ({ ...d, when: key, customWhen: null }));
                  setOpenBlock(null);
                }}
              >
                {lab}
              </Pill>
            ))}
            <input
              type="datetime-local"
              value={draft.customWhen ?? ''}
              min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
              onChange={(e) => setDraft((d) => ({ ...d, when: 'custom', customWhen: e.target.value }))}
              className="col-span-2 rounded-xl px-3 py-3 text-sm text-white bg-transparent border focus:outline-none focus:border-[#00E676] transition-colors"
              style={{ borderColor: BRAND.border, fontFamily: 'var(--font-body)' }}
            />
          </div>
        </Card>

        <Card
          label="Storage"
          value={draft.storage ? 'Yes — bringing bags' : 'No'}
          filled
          open={openBlock === 'storage'}
          onToggle={() => setOpenBlock(openBlock === 'storage' ? null : 'storage')}
        >
          <p className="text-xs text-neutral-400 mb-3">
            Bringing groceries, luggage, or anything bigger than a backpack? Toggle on so drivers know.
          </p>
          <PillRow
            options={[
              ['yes', 'Yes'],
              ['no', 'No'],
            ]}
            value={draft.storage ? 'yes' : 'no'}
            onChange={(v) => {
              setDraft((d) => ({ ...d, storage: v === 'yes' }));
              setOpenBlock(null);
            }}
          />
        </Card>

        <Card
          label="Your price"
          value={`$${finalPrice}`}
          filled
          open={openBlock === 'price'}
          onToggle={() => setOpenBlock(openBlock === 'price' ? null : 'price')}
        >
          <div className="flex items-center gap-3">
            <Stepper onClick={() => setDraft((d) => ({ ...d, price: Math.max(1, (d.price ?? finalPrice) - 5) }))}>
              −
            </Stepper>
            <div className="flex-1 text-center">
              <div
                className="text-4xl tabular-nums"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                ${finalPrice}
              </div>
              {estimate && (
                <div className="text-[11px] text-neutral-500 mt-1">
                  ~{estimate.distance_mi} mi · suggested ${estimate.suggested_price_dollars}
                </div>
              )}
            </div>
            <Stepper onClick={() => setDraft((d) => ({ ...d, price: (d.price ?? finalPrice) + 5 }))}>
              +
            </Stepper>
          </div>
        </Card>

        <Card
          label="Driver"
          value={
            draft.driver_pref === 'any'
              ? 'Any'
              : draft.driver_pref === 'female'
                ? 'Women only'
                : 'Men only'
          }
          filled
          open={openBlock === 'driver_pref'}
          onToggle={() => setOpenBlock(openBlock === 'driver_pref' ? null : 'driver_pref')}
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['any', 'Any'],
                ['female', 'Women'],
                ['male', 'Men'],
              ] as const
            ).map(([key, lab]) => (
              <Pill
                key={key}
                active={draft.driver_pref === key}
                onClick={() => {
                  setDraft((d) => ({ ...d, driver_pref: key }));
                  setOpenBlock(null);
                }}
              >
                {lab}
              </Pill>
            ))}
          </div>
        </Card>

        {/* Phone field appears after trip details start to fill — hidden for signed-in users */}
        <AnimatePresence>
          {tripValid && !isSignedIn && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <Card
                label="Your phone"
                value={draft.phone || 'For driver matches'}
                filled={!!toE164(draft.phone)}
                open={openBlock === 'phone'}
                onToggle={() => setOpenBlock(openBlock === 'phone' ? null : 'phone')}
              >
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(404) 555-1234"
                  value={formatPhone(draft.phone)}
                  onChange={(e) => setDraft((d) => ({ ...d, phone: normalizePhone(e.target.value) }))}
                  className="w-full rounded-xl px-3 py-3 text-base text-white bg-transparent border focus:outline-none focus:border-[#00E676] transition-colors"
                  style={{ borderColor: BRAND.border, fontFamily: 'var(--font-body)' }}
                />
                <p className="text-[11px] text-neutral-500 mt-2">
                  We&rsquo;ll text you a code to confirm. No spam, ever.
                </p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </StaggerContainer>

      {otpError && (
        <div className="mt-3 px-3 py-2 rounded-lg text-xs text-red-300 bg-red-500/10 border border-red-500/30">
          {otpError}
        </div>
      )}

      <FixedFooter>
        <CTAButton
          disabled={!formValid || estimating || otpSendingState === 'sending'}
          onClick={onGetCashRide}
        >
          {otpSendingState === 'sending' ? 'Sending code…' : 'Get Cash Ride'}
        </CTAButton>
        <p className="text-center text-[11px] text-neutral-500 mt-2">
          Free to send. Pay only when a driver matches.
        </p>
      </FixedFooter>
    </div>
  );
}

// ── OTP Step ───────────────────────────────────────────────────────────────

function OtpStep({
  phone,
  onVerify,
  onResend,
  onBack,
  state,
  error,
}: {
  phone: string;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
  state: 'idle' | 'sending' | 'sent' | 'verifying';
  error: string | null;
}) {
  const [code, setCode] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const lastSubmitted = useRef('');

  // Auto-fire when 6 digits typed
  useEffect(() => {
    if (code.length === 6 && state !== 'verifying' && code !== lastSubmitted.current) {
      lastSubmitted.current = code;
      onVerify(code);
    }
  }, [code, state, onVerify]);

  // Reset on error so user can retry
  useEffect(() => {
    if (error) {
      lastSubmitted.current = '';
    }
  }, [error]);

  const setDigit = (idx: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = code.split('');
    next[idx] = digit;
    const joined = next.join('').slice(0, 6);
    setCode(joined);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      e.preventDefault();
      setCode(pasted);
      inputs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  return (
    <div className="px-1 pt-8">
      <div className="text-center space-y-2 mb-8">
        <p className="text-sm text-neutral-400">We sent a 6-digit code to</p>
        <p className="text-base font-semibold text-white tabular-nums">{formatPhone(phone)}</p>
      </div>

      <div className="flex justify-center gap-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            ref={(el) => { inputs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={code[i] ?? ''}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            disabled={state === 'verifying'}
            autoFocus={i === 0}
            className="w-12 h-14 text-center text-2xl tabular-nums rounded-xl bg-[#141414] border focus:outline-none focus:border-[#00E676] transition-colors disabled:opacity-50"
            style={{ borderColor: BRAND.border, fontFamily: 'var(--font-display)' }}
          />
        ))}
      </div>

      {error && (
        <div className="text-center text-xs text-red-400 mb-4">{error}</div>
      )}
      {state === 'verifying' && (
        <div className="text-center text-xs text-neutral-400 mb-4">Verifying…</div>
      )}

      <div className="text-center space-y-3">
        <button
          onClick={onResend}
          disabled={state === 'sending'}
          className="text-xs text-neutral-400 hover:text-white underline disabled:text-neutral-700"
        >
          {state === 'sending' ? 'Sending…' : 'Resend code'}
        </button>
        <div>
          <button
            onClick={onBack}
            className="text-xs text-neutral-500 hover:text-white"
          >
            Wrong number? Go back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Name Step ──────────────────────────────────────────────────────────────

function NameStep({
  value,
  onChange,
  onContinue,
}: {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
}) {
  const valid = value.trim().length >= 2;
  return (
    <div className="px-1 pt-8 pb-32">
      <p className="text-sm text-neutral-400 text-center mb-6">
        Drivers will see this name when you book.
      </p>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid) onContinue();
        }}
        placeholder="e.g. Marcus"
        maxLength={60}
        className="w-full text-center rounded-2xl px-4 py-5 text-2xl bg-[#141414] border focus:outline-none focus:border-[#00E676] transition-colors"
        style={{ borderColor: BRAND.border, fontFamily: 'var(--font-display)' }}
      />
      <FixedFooter>
        <CTAButton disabled={!valid} onClick={onContinue}>
          Continue
        </CTAButton>
      </FixedFooter>
    </div>
  );
}

// ── Photo Step ─────────────────────────────────────────────────────────────

function PhotoStep({
  displayName,
  photoUrl,
  onUploaded,
}: {
  displayName: string;
  photoUrl: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('That doesn\'t look like a photo. Try JPG or PNG.');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('video', file);
      fd.set('profile_type', 'rider');
      fd.set('media_type', 'photo');
      fd.set('save_to_profile', 'false');
      const res = await fetch('/api/upload/video', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || 'Upload failed. Try again.');
        setUploading(false);
        return;
      }
      onUploaded(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setUploading(false);
    }
  }, [onUploaded]);

  const showImage = photoUrl || previewUrl;

  return (
    <div className="px-1 pt-6 pb-32">
      <p className="text-sm text-neutral-400 text-center mb-2">
        {displayName ? `Almost there, ${displayName}!` : 'Almost there!'}
      </p>
      <p className="text-xs text-neutral-500 text-center mb-8">
        Drivers want to know who they&rsquo;re picking up. Snap a quick photo &mdash; safety thing.
      </p>

      <div className="flex justify-center mb-6">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="relative w-44 h-44 rounded-full bg-[#141414] border-2 border-dashed flex items-center justify-center overflow-hidden hover:border-[#00E676] transition-colors disabled:opacity-50"
          style={{ borderColor: showImage ? BRAND.green : 'rgba(255,255,255,0.2)' }}
        >
          {showImage ? (
            <img src={photoUrl || previewUrl || ''} alt="Your photo" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center">
              <div className="text-4xl mb-1">📷</div>
              <div className="text-[11px] text-neutral-400">Tap to take a photo</div>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div
                className="w-8 h-8 rounded-full border-2 border-transparent"
                style={{ borderTopColor: BRAND.green, animation: 'spin 0.8s linear infinite' }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </button>
      </div>

      {error && <div className="text-center text-xs text-red-400 mb-3">{error}</div>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />

      <div className="text-center">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-sm text-[#00E676] underline"
        >
          {uploading ? 'Uploading…' : showImage ? 'Choose different photo' : 'Choose from library'}
        </button>
      </div>
    </div>
  );
}

// ── Ready Step (final recap + Get My Ride) ────────────────────────────────

function ReadyStep({
  draft,
  finalPrice,
  photoUrl,
  onSend,
  submitting,
  error,
}: {
  draft: FormDraft;
  finalPrice: number;
  photoUrl: string;
  onSend: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="px-1 pt-6">
      <div
        className="rounded-2xl p-5 mb-4 border"
        style={{ background: BRAND.card, borderColor: BRAND.border }}
      >
        <div className="flex items-center gap-3 mb-4">
          {photoUrl && (
            <img src={photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500" style={{ fontFamily: 'var(--font-mono)' }}>
              Your trip
            </div>
            <div className="text-2xl tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
              ${finalPrice}
            </div>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <RecapRow label="From" value={draft.pickup?.address ?? ''} />
          <RecapRow label="To" value={draft.dropoff?.address ?? ''} />
          <RecapRow label="When" value={draft.when === 'now' ? 'Now' : draft.customWhen || draft.when.replace('_', ' ')} />
          {draft.storage && <RecapRow label="Storage" value="Yes" />}
          {draft.driver_pref !== 'any' && (
            <RecapRow label="Driver" value={draft.driver_pref === 'female' ? 'Women only' : 'Men only'} />
          )}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 mb-3 rounded-lg text-xs text-red-300 bg-red-500/10 border border-red-500/30">
          {error}
        </div>
      )}

      <FixedFooter>
        <CTAButton onClick={onSend} disabled={submitting}>
          {submitting ? 'Blasting…' : 'Get My Ride'}
        </CTAButton>
        <p className="text-center text-[11px] text-neutral-500 mt-2">
          We&rsquo;ll text matching drivers right now.
        </p>
      </FixedFooter>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      <span className="text-white text-right truncate flex-1">{value}</span>
    </div>
  );
}

// ── Reusable controls ──────────────────────────────────────────────────────

function StaggerContainer({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
      }}
      className="space-y-2"
    >
      {Array.isArray(children)
        ? children.map((c, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.25, 0.1, 0.25, 1] } },
              }}
            >
              {c}
            </motion.div>
          ))
        : children}
    </motion.div>
  );
}

interface CardProps {
  label: string;
  value: string;
  filled: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Card({ label, value, filled, open, onToggle, children }: CardProps) {
  return (
    <section
      className="rounded-2xl overflow-hidden border transition-colors"
      style={{
        background: BRAND.card,
        borderColor: open ? BRAND.borderActive : BRAND.border,
      }}
    >
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-4 text-left">
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] uppercase tracking-[0.15em] text-neutral-500"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {label}
          </div>
          <div
            className="text-base mt-1 truncate"
            style={{ color: filled ? '#fff' : 'rgba(255,255,255,0.5)' }}
          >
            {value}
          </div>
        </div>
        <span
          className="ml-3 text-neutral-500 text-xs transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function PillRow({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<readonly [string, string]>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map(([key, lab]) => (
        <Pill key={key} active={value === key} onClick={() => onChange(key)}>
          {lab}
        </Pill>
      ))}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
      style={{
        background: active ? BRAND.green : 'rgba(255,255,255,0.05)',
        color: active ? '#000' : 'rgba(255,255,255,0.8)',
      }}
    >
      {children}
    </button>
  );
}

function Stepper({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-12 h-12 rounded-xl text-xl active:scale-95 transition-transform"
      style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
    >
      {children}
    </button>
  );
}

function FixedFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-5 pt-3">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(to top, rgba(8,8,8,1) 60%, rgba(8,8,8,0))',
        }}
      />
      {children}
    </div>
  );
}

function CTAButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      whileHover={!disabled ? { scale: 1.01 } : {}}
      transition={{ duration: 0.12 }}
      className="block w-full text-center py-4 rounded-2xl text-base font-bold disabled:opacity-50 transition-all"
      style={{
        background: disabled ? 'rgba(255,255,255,0.08)' : BRAND.green,
        color: disabled ? 'rgba(255,255,255,0.4)' : '#000',
        boxShadow: disabled ? 'none' : '0 0 32px rgba(0,230,118,0.25)',
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.01em',
      }}
    >
      {children}
    </motion.button>
  );
}

// ── Mapbox autocomplete ────────────────────────────────────────────────────

function AddressInput({
  sessionToken,
  onPick,
}: {
  sessionToken: string;
  onPick: (p: PointPick) => void;
}) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      setLoading(true);
      const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
      url.searchParams.set('q', q);
      url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
      url.searchParams.set('session_token', sessionToken);
      url.searchParams.set('country', 'us');
      url.searchParams.set('bbox', '-84.8,33.5,-84.1,34.1');
      url.searchParams.set('limit', '6');
      url.searchParams.set('types', 'address,poi,place,neighborhood,locality');
      url.searchParams.set('language', 'en');
      fetch(url.toString())
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((data) => {
          setSuggestions(
            (data.suggestions || []).map((s: Record<string, unknown>) => ({
              name: s.name as string,
              full_address: (s.full_address as string) || (s.place_formatted as string) || '',
              mapbox_id: s.mapbox_id as string,
            })),
          );
        })
        .finally(() => setLoading(false));
    }, 250);
  }, [q, sessionToken]);

  const handlePick = useCallback(
    async (s: MapboxSuggestion) => {
      const url = new URL(`https://api.mapbox.com/search/searchbox/v1/retrieve/${s.mapbox_id}`);
      url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
      url.searchParams.set('session_token', sessionToken);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature) return;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      onPick({
        lat,
        lng,
        address: (feature.properties.full_address as string) || (feature.properties.place_formatted as string) || s.name,
      });
    },
    [sessionToken, onPick],
  );

  return (
    <div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Type an address or neighborhood"
        className="w-full rounded-xl px-3 py-3 text-base text-white bg-transparent border focus:outline-none focus:border-[#00E676] transition-colors"
        style={{ borderColor: BRAND.border, fontFamily: 'var(--font-body)' }}
      />
      {loading && <div className="text-xs text-neutral-500 mt-2">Searching…</div>}
      {suggestions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {suggestions.map((s) => (
            <li key={s.mapbox_id}>
              <button
                onClick={() => handlePick(s)}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
                style={{ background: BRAND.cardElev }}
              >
                <div className="text-sm text-white">{s.name}</div>
                <div className="text-[11px] text-neutral-500">{s.full_address}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
