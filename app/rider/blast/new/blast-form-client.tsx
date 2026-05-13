'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
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

type Block = 'pickup' | 'dropoff' | 'trip_type' | 'when' | 'storage' | 'price' | 'driver_pref' | 'rider_gender' | 'phone';
type Step = 'form' | 'name' | 'photo' | 'ready';

interface FormDraft {
  pickup: PointPick | null;
  dropoff: PointPick | null;
  trip_type: 'one_way' | 'round_trip';
  when: 'now' | 'in_1h' | 'tonight' | 'tomorrow_am' | 'custom';
  customWhen: string | null;
  storage: boolean;
  price: number | null;
  driver_pref: 'male' | 'female' | 'any';
  rider_gender: 'man' | 'woman' | 'other' | null;
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
  rider_gender: null,
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
  const { isSignedIn, isLoaded: userLoaded } = useUser();
  const clerk = useClerk();

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
  // Tracks whether we've launched Clerk for THIS form session — used so the
  // useEffect-watcher only advances after an explicit Get Cash Ride tap, not
  // on initial render when an already-signed-in user is in form step.
  const [authLaunched, setAuthLaunched] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
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
  const tripValid = !!(draft.pickup && draft.dropoff && finalPrice > 0);
  const genderValid = !!draft.rider_gender;
  // Phone collection moved into Clerk's hosted form — staging Clerk does
  // username/password, prod Clerk does phone OTP. The form just validates
  // trip details + the rider's own gender (so the matching algorithm can
  // honor drivers' rider_gender_pref filter).
  const formValid = tripValid && genderValid;

  // ── Continue post-auth: bootstrap our DB row and advance to next missing step ──
  const continueAfterAuth = useCallback(async () => {
    setAuthError(null);
    try {
      const r = await fetch('/api/blast/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: draft.phone,
          gender: draft.rider_gender,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { hasDisplayName?: boolean; hasPhoto?: boolean };
      if (!body.hasDisplayName) setStep('name');
      else if (!body.hasPhoto) setStep('photo');
      else setStep('ready');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Could not continue');
    }
  }, [draft.phone, draft.rider_gender]);

  // ── Get Cash Ride: open Clerk hosted form (or skip if already signed in) ──
  const handleGetCashRide = useCallback(() => {
    if (isSignedIn) {
      void continueAfterAuth();
      return;
    }
    setAuthLaunched(true);
    setAuthError(null);
    // Open Clerk's hosted sign-up modal.
    //
    // forceRedirectUrl: keep the user on /rider/blast/new after auth.
    //   Without this, Clerk uses the dashboard's afterSignUpUrl (currently
    //   /auth-callback → /onboarding) which dumps blast riders out of the
    //   funnel.
    //
    // signInForceRedirectUrl: same override for the "Sign in instead" toggle
    //   inside the modal.
    //
    // appearance: hand-rolled dark theme so the modal matches the app's
    //   #080808 / #00E676 brand. The other staging routes use the same
    //   token set; without this the modal renders Clerk's default light theme.
    clerk.openSignUp({
      forceRedirectUrl: '/rider/blast/new',
      signInForceRedirectUrl: '/rider/blast/new',
      unsafeMetadata: { source: 'blast_funnel', profileType: 'rider' },
      appearance: {
        variables: {
          colorPrimary: '#00E676',
          colorBackground: '#141414',
          colorInputBackground: '#0a0a0a',
          colorInputText: '#ffffff',
          colorText: '#ffffff',
          colorTextSecondary: '#a3a3a3',
          colorDanger: '#f87171',
          borderRadius: '0.75rem',
          fontFamily: 'var(--font-body)',
        },
        elements: {
          rootBox: 'mx-auto',
          card: 'bg-[#141414] border border-white/10 shadow-2xl',
          headerTitle: 'text-white',
          headerSubtitle: 'text-neutral-400',
          socialButtonsBlockButton: 'bg-white/5 border-white/10 text-white hover:bg-white/10',
          formButtonPrimary:
            'bg-[#00E676] text-black hover:bg-[#00d96a] normal-case font-bold',
          formFieldInput: 'bg-[#0a0a0a] border-white/10 text-white',
          formFieldLabel: 'text-neutral-300',
          footerActionText: 'text-neutral-400',
          footerActionLink: 'text-[#00E676] hover:text-[#00d96a]',
          identityPreviewText: 'text-white',
          identityPreviewEditButton: 'text-[#00E676]',
          dividerLine: 'bg-white/10',
          dividerText: 'text-neutral-500',
        },
      },
    });
  }, [isSignedIn, continueAfterAuth, clerk]);

  // Watch for Clerk modal closing with a fresh sign-in. Once isSignedIn flips
  // true after we've launched, run the same continuation as the signed-in path.
  useEffect(() => {
    if (!userLoaded || !authLaunched || !isSignedIn) return;
    void continueAfterAuth();
  }, [userLoaded, authLaunched, isSignedIn, continueAfterAuth]);

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
      className="min-h-screen text-white pt-14 pb-32"
      style={{ background: BRAND.bg, fontFamily: 'var(--font-body)' }}
    >
      <CelebrationConfetti active={confetti} variant="cannon" />

      <Header step={step} onBack={() => step !== 'form' && setStep('form')} />

      <main className="px-3 pt-4">
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
                authError={authError}
                authLaunched={authLaunched}
                sessionToken={sessionToken.current}
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
    name: 'What should we call you?',
    photo: 'Snap a photo',
    ready: 'Ready to roll',
  };
  const showBack = step !== 'form' && step !== 'ready';
  return (
    <header
      // top-14 sits the sticky header below the global app header
      // (components/layout/header.tsx is fixed top-0 h-14 z-50).
      className="sticky top-14 z-30 backdrop-blur-xl border-b"
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
              Tell Drivers What you need. They&rsquo;ll Say HMU.
            </p>
          )}
        </div>
        <StepBadge step={step} />
      </div>
    </header>
  );
}

function StepBadge({ step }: { step: Step }) {
  const order: Step[] = ['form', 'name', 'photo', 'ready'];
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
  authLaunched: boolean;
  authError: string | null;
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
  authLaunched,
  authError,
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

        {/* Rider's own gender — required so the matching algorithm can honor
            drivers who set rider_gender_pref = women_only or men_only. Without
            this we silently exclude the rider from those drivers' inboxes. */}
        <Card
          label="You"
          value={
            draft.rider_gender === 'woman'
              ? 'Woman'
              : draft.rider_gender === 'man'
                ? 'Man'
                : draft.rider_gender === 'other'
                  ? 'Other'
                  : 'Pick one'
          }
          filled={!!draft.rider_gender}
          open={openBlock === 'rider_gender'}
          onToggle={() => setOpenBlock(openBlock === 'rider_gender' ? null : 'rider_gender')}
        >
          <p className="text-xs text-neutral-400 mb-3">
            Some drivers only pick up women or men — this makes sure they see your blast.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['woman', 'Woman'],
                ['man', 'Man'],
                ['other', 'Other'],
              ] as const
            ).map(([key, lab]) => (
              <Pill
                key={key}
                active={draft.rider_gender === key}
                onClick={() => {
                  setDraft((d) => ({ ...d, rider_gender: key }));
                  setOpenBlock(null);
                }}
              >
                {lab}
              </Pill>
            ))}
          </div>
        </Card>

      </StaggerContainer>

      {authError && (
        <div className="mt-3 px-3 py-2 rounded-lg text-xs text-red-300 bg-red-500/10 border border-red-500/30">
          {authError}
        </div>
      )}

      <FixedFooter>
        <CTAButton
          disabled={!formValid || estimating || authLaunched}
          onClick={onGetCashRide}
        >
          {authLaunched ? 'Waiting for sign-in…' : 'Get Cash Ride'}
        </CTAButton>
        <p className="text-center text-[11px] text-neutral-500 mt-2">
          {isSignedIn ? 'Almost there — just a couple more details.' : 'Free to send. Sign in or sign up to continue.'}
        </p>
      </FixedFooter>
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

      {/* No `capture` attribute — lets the browser show camera + library
          picker on mobile. With `capture="user"` we'd force the front-facing
          camera and lock out the photo library, which the founder flagged. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
          {uploading ? 'Uploading…' : showImage ? 'Choose different photo' : 'Take photo or choose from library'}
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
