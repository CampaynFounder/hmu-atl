'use client';

// Express driver onboarding — the lower-friction variant.
// Driven by the platform_config row 'onboarding.driver_express' (admin-tunable
// at /admin/onboarding-config). Fields marked 'deferred' are not collected here
// and instead surface in the Pre-Ride To-Do once the driver is live.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { fbEvent } from '@/components/analytics/meta-pixel';
import { Welcome } from './welcome';
import { VideoRecorder } from './video-recorder';
import { RiderPreferencesStep, type RiderPreferences } from './rider-preferences';
import { LocationPermission } from './location-permission';
import CelebrationConfetti from '@/components/shared/celebration-confetti';
import { ExpressVehiclePicker } from './express/vehicle-picker';
import { ExpressPricingPill } from './express/pricing-pill';
import {
  DRIVER_EXPRESS_DEFAULTS,
  type DriverExpressConfig,
  type FieldVisibility,
  type PricingTier,
  pickDefaultTier,
  pricingFromTier,
} from '@/lib/onboarding/config';

interface Props {
  onComplete: () => void;
  tier?: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  allowedSeats: number[];
  thirdRow: boolean;
  maxAdults: number;
  gender: string;
  pronouns: string;
  lgbtqFriendly: boolean;
  licensePlate: string;
  plateState: string;
  videoIntroUrl: string;
  videoThumbnailUrl: string;
  adPhotoUrl: string;
  handleAvailable: boolean;
  isUploading: boolean;
  riderPreferences: RiderPreferences;
  pricingTier: PricingTier;
}

export function DriverOnboardingExpress({ onComplete, tier = 'free' }: Props) {
  const [config, setConfig] = useState<DriverExpressConfig>(DRIVER_EXPRESS_DEFAULTS);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const defaultTier = pickDefaultTier(DRIVER_EXPRESS_DEFAULTS.pricingTiers);
  const [data, setData] = useState<FormData>({
    firstName: '',
    lastName: '',
    displayName: '',
    phone: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    allowedSeats: [1, 2, 3, 4],
    thirdRow: false,
    maxAdults: 4,
    gender: '',
    pronouns: '',
    lgbtqFriendly: false,
    licensePlate: '',
    plateState: 'GA',
    videoIntroUrl: '',
    videoThumbnailUrl: '',
    adPhotoUrl: '',
    handleAvailable: false,
    isUploading: false,
    riderPreferences: {
      riderGenderPref: 'any',
      requireOgStatus: false,
      minRiderChillScore: 0,
      lgbtqFriendly: false,
      avoidRidersWithDisputes: true,
    },
    pricingTier: defaultTier,
  });

  // Pull live config; fall back to defaults if the API hiccups.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding/driver-express-config', { cache: 'no-store' });
        if (!cancelled && res.ok) {
          const body = await res.json();
          const c = body.config as DriverExpressConfig;
          setConfig(c);
          setData(d => ({ ...d, pricingTier: pickDefaultTier(c.pricingTiers) }));
        }
      } catch { /* ignore — defaults are fine */ }
      finally { if (!cancelled) setConfigLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (patch: Partial<FormData>) => setData(prev => ({ ...prev, ...patch }));

  // Visibility helpers
  const inFlow = (v: FieldVisibility) => v === 'required' || v === 'optional';

  type StepDef = {
    id: string;
    title: string;
    description: string;
    component: React.ReactNode;
    required: boolean;
    isValid: () => boolean;
  };

  const steps: StepDef[] = [];

  // 1. Welcome (handle + gender). Always present. Govt-name hidden in express.
  steps.push({
    id: 'welcome',
    title: 'Pick your handle',
    description: 'This is what riders see. Pick something memorable.',
    component: (
      <Welcome
        onNext={() => setCurrentStep(1)}
        userType="driver"
        hideGovName
        data={data}
        onChange={(d) => update(d)}
      />
    ),
    required: true,
    isValid: () => Boolean(data.gender && data.displayName.trim().length >= 2 && data.handleAvailable),
  });

  // 2. Vehicle — required by spec, with seat-map sub-step.
  if (config.fields.vehicleMakeModel !== 'hidden' || config.fields.seatMap !== 'hidden') {
    steps.push({
      id: 'vehicle',
      title: 'Your ride',
      description: 'Tell riders what they\'re getting into.',
      component: (
        <ExpressVehiclePicker
          make={data.vehicleMake}
          model={data.vehicleModel}
          year={data.vehicleYear}
          yearVisibility={config.fields.vehicleYear === 'hidden' ? 'hidden' : config.fields.vehicleYear === 'required' ? 'required' : 'optional'}
          allowedSeats={data.allowedSeats}
          thirdRow={data.thirdRow}
          onChange={update}
        />
      ),
      required: config.fields.vehicleMakeModel === 'required',
      isValid: () => {
        const okMake = !!data.vehicleMake.trim() && !!data.vehicleModel.trim();
        const okYear = config.fields.vehicleYear === 'required' ? !!data.vehicleYear.trim() : true;
        const okSeats = config.fields.seatMap === 'required' ? data.allowedSeats.length > 0 : true;
        return okMake && okYear && okSeats;
      },
    });
  }

  // 3. Pricing pill — always part of express; cascades to 30/1h/2h.
  steps.push({
    id: 'pricing',
    title: 'Set your minimum',
    description: 'We\'ll auto-fill the rest. Tweak any of it from your profile later.',
    component: (
      <ExpressPricingPill
        tiers={config.pricingTiers}
        selectedMin={data.pricingTier.min}
        stopsFee={config.stopsFee}
        waitPerMin={config.waitPerMin}
        onChange={(t) => update({ pricingTier: t })}
      />
    ),
    required: true,
    isValid: () => true,
  });

  // 4. License plate (only if in-flow per config).
  if (inFlow(config.fields.licensePlate)) {
    steps.push({
      id: 'license-plate',
      title: 'Your plate',
      description: 'Riders use this to spot you at pickup.',
      component: (
        <input
          type="text"
          value={data.licensePlate}
          onChange={(e) => update({ licensePlate: e.target.value.toUpperCase().replace(/[^A-Z0-9 \-]/g, '') })}
          placeholder="ABC 1234"
          maxLength={10}
          className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20 uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-mono, Space Mono, monospace)', fontSize: '20px', letterSpacing: '4px' }}
        />
      ),
      required: config.fields.licensePlate === 'required',
      isValid: () => config.fields.licensePlate === 'required' ? data.licensePlate.trim().length > 0 : true,
    });
  }

  // 5. Video intro
  if (inFlow(config.fields.videoIntro)) {
    steps.push({
      id: 'video-intro',
      title: 'Quick video intro',
      description: 'A short clip helps riders trust you before they book.',
      component: (
        <VideoRecorder
          onVideoRecorded={(videoUrl, thumbnailUrl) => update({ videoIntroUrl: videoUrl, videoThumbnailUrl: thumbnailUrl })}
          existingVideoUrl={data.videoIntroUrl || undefined}
          onUploadStateChange={(uploading) => update({ isUploading: uploading })}
        />
      ),
      required: config.fields.videoIntro === 'required',
      isValid: () => config.fields.videoIntro === 'required' ? !!data.videoIntroUrl : true,
    });
  }

  // 6. Rider preferences
  if (inFlow(config.fields.riderPreferences)) {
    steps.push({
      id: 'rider-prefs',
      title: 'Who you ride with',
      description: 'You can change these any time.',
      component: (
        <RiderPreferencesStep
          preferences={data.riderPreferences}
          onChange={(prefs) => update({ riderPreferences: { ...data.riderPreferences, ...prefs } })}
        />
      ),
      required: false,
      isValid: () => true,
    });
  }

  // 7. Location
  if (inFlow(config.fields.location)) {
    steps.push({
      id: 'location',
      title: 'Enable location',
      description: 'Riders see you on the map when you\'re OTW.',
      component: <LocationPermission userType="driver" />,
      required: false,
      isValid: () => true,
    });
  }

  const isLast = currentStep === steps.length - 1;
  const cur = steps[currentStep];
  const canProceed = cur ? (cur.required ? cur.isValid() : true) : false;

  async function handleNext() {
    if (saving || !cur) return;
    if (isLast) {
      setSaving(true);
      setSaveError(null);
      try {
        await saveExpress(data, config);
        fbEvent('StartTrial', { content_name: 'Driver Onboarding Express Complete', content_category: 'driver_funnel' });
        setShowConfirmation(true);
      } catch (err) {
        // Surface the failure on the same step instead of silently flipping
        // to the confirmation screen — otherwise the next nav lands on
        // /driver/profile which redirects back to /onboarding because no
        // driver_profiles row was created.
        const msg = err instanceof Error ? err.message : 'Setup failed — try again';
        setSaveError(msg);
        setSaving(false);
      }
    } else {
      setCurrentStep(s => s + 1);
      window.scrollTo(0, 0);
    }
  }

  if (!configLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00E676] border-t-transparent" />
      </div>
    );
  }

  if (showConfirmation) {
    return (
      <YoureLiveScreen
        name={data.displayName || data.firstName || 'driver'}
        minRide={data.pricingTier.min}
        onContinue={onComplete}
      />
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ paddingTop: 56, paddingBottom: 'max(24px, env(safe-area-inset-bottom))', background: '#0a0a0a' }}
    >
      <div className="sticky z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800" style={{ top: 56 }}>
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-full bg-[#00E676]/20 px-3 py-1 text-xs font-bold text-[#00E676] uppercase tracking-wide">
              Driver · Express
            </span>
            {tier === 'hmu_first' ? (
              <span className="rounded-full bg-[#00E676] px-3 py-1 text-xs font-black text-black">HMU First</span>
            ) : null}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-400">Step {currentStep + 1} of {steps.length}</span>
            <span className="text-sm font-medium text-zinc-400">
              {Math.round(((currentStep + 1) / steps.length) * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <motion.div
              className="h-full bg-[#00E676]"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-black text-white">{cur?.title}</h1>
                <p className="text-zinc-400">{cur?.description}</p>
              </div>

              <div className="rounded-2xl bg-zinc-800 border border-zinc-700 p-6">{cur?.component}</div>

              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => { setCurrentStep(s => Math.max(0, s - 1)); window.scrollTo(0, 0); }}
                  disabled={currentStep === 0}
                  className="flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-zinc-400 transition-all hover:bg-zinc-800 disabled:opacity-0"
                >
                  <ArrowLeft className="h-5 w-5" /> Back
                </button>
                <div className="flex flex-col items-end gap-2">
                  {isLast && (
                    <p className="text-[10px] text-zinc-500 text-right max-w-[260px] leading-tight">
                      By tapping Let&apos;s Go, you agree to our{' '}
                      <a href="/terms" className="text-[#00E676]">Terms</a> &amp;{' '}
                      <a href="/privacy" className="text-[#00E676]">Privacy</a>.
                    </p>
                  )}
                  <button
                    onClick={handleNext}
                    disabled={!canProceed || saving || data.isUploading}
                    className="flex items-center gap-2 rounded-full bg-[#00E676] px-8 py-3 font-black text-black shadow-lg transition-all hover:shadow-[0_0_24px_rgba(0,230,118,0.3)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  >
                    {saving ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" /> Setting up...
                      </>
                    ) : isLast ? (
                      <><Check className="h-5 w-5" /> Let&apos;s Go</>
                    ) : (
                      <>Next <ArrowRight className="h-5 w-5" /></>
                    )}
                  </button>
                </div>
              </div>

              {!cur?.required && (
                <div className="text-center">
                  <button
                    onClick={() => { if (!data.isUploading) { setCurrentStep(s => s + 1); window.scrollTo(0, 0); } }}
                    className={`text-sm transition-colors ${data.isUploading ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {data.isUploading ? 'Uploading...' : 'Skip for now'}
                  </button>
                </div>
              )}

              {saveError && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-950/60 border border-red-800/60 p-3 text-sm text-red-300 text-center"
                >
                  {saveError}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

async function saveExpress(data: FormData, config: DriverExpressConfig): Promise<void> {
  const pricing = pricingFromTier(data.pricingTier, config.stopsFee);
  const schedule = {
    days: config.scheduleDefault.days,
    notice_required: config.scheduleDefault.noticeRequired,
    start: config.scheduleDefault.start,
    end: config.scheduleDefault.end,
    wait_per_min: config.waitPerMin,
  };

  let res: Response;
  try {
    res = await fetch('/api/users/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_type: 'driver',
        // Govt name is deferred in express — pass empty strings; activation
        // checklist + Stripe payout setup will collect later.
        first_name: data.firstName || data.displayName,
        last_name: data.lastName || '',
        display_name: data.displayName,
        phone: data.phone || null,
        gender: data.gender,
        pronouns: data.pronouns,
        lgbtq_friendly: data.lgbtqFriendly,
        rider_gender_pref: data.riderPreferences.riderGenderPref,
        require_og_status: data.riderPreferences.requireOgStatus,
        min_rider_chill_score: data.riderPreferences.minRiderChillScore,
        avoid_riders_with_disputes: data.riderPreferences.avoidRidersWithDisputes,
        video_url: data.videoIntroUrl || null,
        thumbnail_url: data.videoThumbnailUrl || null,
        ad_photo_url: data.adPhotoUrl || null,
        license_plate: data.licensePlate || null,
        plate_state: data.plateState || null,
        pricing,
        schedule,
        vehicle_info: {
          make: data.vehicleMake,
          model: data.vehicleModel,
          year: data.vehicleYear || null,
          max_adults: data.maxAdults,
          allowed_seats: data.allowedSeats,
          third_row: data.thirdRow,
        },
      }),
    });
  } catch (networkErr) {
    console.error('Express onboarding network failure:', networkErr);
    throw new Error('Network problem. Check your connection and try again.');
  }

  // fetch only rejects on network errors; a 4xx/5xx still resolves. Without
  // this guard the You're Live screen would show even when the driver_profile
  // row was never created, which sent users back to /onboarding the moment
  // they tapped any link to /driver/profile.
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const body = await res.json();
      detail = (body?.error as string) || (body?.details as string) || null;
    } catch { /* non-JSON body */ }
    console.error('Express onboarding rejected:', res.status, detail);
    throw new Error(detail || `Setup failed (${res.status}). Try again.`);
  }

  fetch('/api/users/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'driver_onboarding_express_completed',
      properties: {
        minRide: data.pricingTier.min,
        maxAdults: data.maxAdults,
        thirdRow: data.thirdRow,
      },
    }),
  }).catch(console.error);
}

function YoureLiveScreen({ name, minRide, onContinue }: { name: string; minRide: number; onContinue: () => void }) {
  const [navigating, setNavigating] = useState(false);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#080808', overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes scaleIn { 0% { transform: scale(0); } 60% { transform: scale(1.1); } 100% { transform: scale(1); } }
        @keyframes fadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <CelebrationConfetti active variant="cannon" />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px', maxWidth: '380px' }}>
        <div style={{ animation: 'scaleIn 0.5s ease-out', marginBottom: '20px' }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '50%',
            background: 'rgba(0,230,118,0.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', margin: '0 auto',
          }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: '#00E676', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Check className="w-7 h-7 text-black" strokeWidth={3} />
            </div>
          </div>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
            fontSize: '40px', lineHeight: 1, color: '#fff',
            marginBottom: '12px',
            animation: 'fadeUp 0.5s ease-out 0.3s both',
          }}
        >
          YOU&apos;RE LIVE, {name.toUpperCase()}!
        </h1>

        <div
          style={{
            fontSize: '14px', color: '#bbb', lineHeight: 1.55,
            marginBottom: '24px',
            animation: 'fadeUp 0.5s ease-out 0.5s both',
            background: 'rgba(0,230,118,0.06)',
            border: '1px solid rgba(0,230,118,0.2)',
            borderRadius: 12,
            padding: '14px 16px',
            textAlign: 'left',
          }}
        >
          <strong style={{ color: '#fff' }}>Your minimum is set to ${minRide}.</strong>{' '}
          30-min, 1hr, and 2hr rates filled in to match. Tweak any of it from your profile after you tap below.
        </div>

        <button
          type="button"
          onClick={() => { if (navigating) return; setNavigating(true); onContinue(); }}
          disabled={navigating}
          style={{
            width: '100%', padding: '18px', borderRadius: '100px',
            border: 'none', background: '#00E676', color: '#080808',
            fontWeight: 800, fontSize: '17px', cursor: navigating ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body, DM Sans, sans-serif)',
            opacity: navigating ? 0.6 : 1,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'rgba(0,0,0,0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          {navigating ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid #080808', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Loading...
            </>
          ) : 'Make More $$$'}
        </button>

        <a
          href="/driver/playbook"
          style={{
            display: 'block', marginTop: '16px', textAlign: 'center',
            fontSize: '13px', color: '#666', textDecoration: 'none',
            animation: 'fadeUp 0.5s ease-out 0.9s both',
            fontFamily: 'var(--font-body, DM Sans, sans-serif)',
          }}
        >
          See driver playbook &rarr;
        </a>
      </div>
    </div>
  );
}
