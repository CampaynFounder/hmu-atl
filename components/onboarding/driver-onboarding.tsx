'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fbEvent } from '@/components/analytics/meta-pixel';
import { Welcome } from './welcome';
import { VideoRecorder } from './video-recorder';
import { RiderPreferencesStep, type RiderPreferences } from './rider-preferences';
import { LocationPermission } from './location-permission';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface DriverOnboardingProps {
  onComplete: () => void;
  tier?: string;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ReactNode;
  required: boolean;
}

export function DriverOnboarding({ onComplete, tier = 'free' }: DriverOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<{
    firstName: string;
    lastName: string;
    displayName: string;
    phone: string;
    licensePlate: string;
    plateState: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: string;
    maxAdults: number;
    maxChildren: number;
    gender: string;
    pronouns: string;
    lgbtqFriendly: boolean;
    videoIntroUrl: string;
    videoThumbnailUrl: string;
    adPhotoUrl: string;
    handleAvailable: boolean;
    isUploading: boolean;
    riderPreferences: RiderPreferences;
    stripeConnectId: string;
  }>({
    firstName: '',
    lastName: '',
    displayName: '',
    phone: '',
    licensePlate: '',
    plateState: 'GA',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    maxAdults: 4,
    maxChildren: 0,
    gender: '',
    pronouns: '',
    lgbtqFriendly: false,
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
    stripeConnectId: '',
  });

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: "Let\u2019s Get You Set Up",
      description: 'Your info, your handle, your identity',
      component: (
        <Welcome
          onNext={() => setCurrentStep(1)}
          userType="driver"
          data={formData}
          onChange={(data) => setFormData((prev) => ({ ...prev, ...data }))}
        />
      ),
      required: true,
    },
    {
      id: 'license-plate',
      title: 'Your License Plate 🚗',
      description: 'Riders see this when you\'re close — helps them find you. Update anytime if you switch cars.',
      component: (
        <LicensePlateStep
          plate={formData.licensePlate}
          state={formData.plateState}
          onChange={(plate, state) => setFormData((prev) => ({ ...prev, licensePlate: plate, plateState: state }))}
        />
      ),
      required: true,
    },
    {
      id: 'vehicle-details',
      title: 'Your Vehicle 🚗',
      description: 'Riders see this on your card — what are they getting into?',
      component: (
        <VehicleDetailsStep
          make={formData.vehicleMake}
          model={formData.vehicleModel}
          year={formData.vehicleYear}
          maxAdults={formData.maxAdults}
          maxChildren={formData.maxChildren}
          onChange={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
        />
      ),
      required: true,
    },
    {
      id: 'video-intro',
      title: 'Record your intro 🎥',
      description: 'A quick video so riders know who\'s pulling up',
      component: (
        <VideoRecorder
          onVideoRecorded={(videoUrl, thumbnailUrl) =>
            setFormData((prev) => ({
              ...prev,
              videoIntroUrl: videoUrl,
              videoThumbnailUrl: thumbnailUrl,
            }))
          }
          existingVideoUrl={formData.videoIntroUrl || undefined}
          onUploadStateChange={(uploading) => setFormData((prev) => ({ ...prev, isUploading: uploading }))}
        />
      ),
      required: false,
    },
    {
      id: 'hmu-ad',
      title: 'Your HMU Ad \uD83D\uDCF8',
      description: 'Upload a photo for your HMU link — vehicle pic, promo card, or anything that gets riders to book you',
      component: (
        <AdPhotoStep
          photoUrl={formData.adPhotoUrl}
          onUploaded={(url) => setFormData((prev) => ({ ...prev, adPhotoUrl: url }))}
          onUploadStateChange={(uploading) => setFormData((prev) => ({ ...prev, isUploading: uploading }))}
        />
      ),
      required: false,
    },
    {
      id: 'rider-prefs',
      title: 'Who you ride with \uD83D\uDE97',
      description: 'Set your rider standards — change anytime',
      component: (
        <RiderPreferencesStep
          preferences={formData.riderPreferences}
          onChange={(prefs) =>
            setFormData((prev) => ({
              ...prev,
              riderPreferences: { ...prev.riderPreferences, ...prefs },
            }))
          }
        />
      ),
      required: false,
    },
    {
      id: 'location',
      title: 'Enable Location 📍',
      description: 'Riders need to see you on the map when you\'re OTW',
      component: <LocationPermission userType="driver" />,
      required: false,
    },
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const canProceed = currentStepData.required
    ? validateStep(currentStepData.id, formData)
    : true;

  const handleNext = async () => {
    if (saving) return;
    if (isLastStep) {
      setSaving(true);
      await saveDriverOnboarding(formData);
      fbEvent('StartTrial', { content_name: 'Driver Onboarding Complete', content_category: 'driver_funnel' });
      setShowConfirmation(true);
    } else {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  if (showConfirmation) {
    return <ConfirmationScreen name={formData.displayName || formData.firstName} onContinue={onComplete} />;
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ paddingTop: 56, background: '#0a0a0a' }}>
      {/* Progress Bar */}
      <div className="sticky z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800" style={{ top: 56 }}>
        <div className="mx-auto max-w-2xl px-4 py-4">
          {/* Account type badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-full bg-[#00E676]/20 px-3 py-1 text-xs font-bold text-[#00E676] uppercase tracking-wide">
              Driver Account
            </span>
            {tier === 'hmu_first' ? (
              <span className="rounded-full bg-[#00E676] px-3 py-1 text-xs font-black text-black">
                HMU First
              </span>
            ) : (
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400">
                Free Tier
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-400">
              Step {currentStep + 1} of {steps.length}
            </span>
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

      {/* Content */}
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
                <h1 className="text-3xl font-black text-white">{currentStepData.title}</h1>
                <p className="text-zinc-400">{currentStepData.description}</p>
              </div>

              <div className="rounded-2xl bg-zinc-800 border border-zinc-700 p-6">
                {currentStepData.component}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => { setCurrentStep((prev) => Math.max(0, prev - 1)); window.scrollTo(0, 0); }}
                  disabled={currentStep === 0}
                  className="flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-zinc-400 transition-all hover:bg-zinc-800 disabled:opacity-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </button>

                <div className="flex gap-2">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-2 rounded-full transition-all ${
                        index === currentStep
                          ? 'w-8 bg-[#00E676]'
                          : index < currentStep
                          ? 'w-2 bg-[#00E676]/40'
                          : 'w-2 bg-zinc-700'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {isLastStep && (
                    <p className="text-[10px] text-zinc-500 text-right max-w-[260px] leading-tight">
                      By tapping Let&apos;s Go, you agree to our{' '}
                      <a href="/terms" className="text-[#00E676]">Terms</a> &amp;{' '}
                      <a href="/privacy" className="text-[#00E676]">Privacy Policy</a>
                      , and consent to receive SMS &amp; email notifications about your rides and payments. Reply STOP to opt out of marketing SMS.
                    </p>
                  )}
                  <button
                    onClick={handleNext}
                    disabled={!canProceed || saving || formData.isUploading}
                    className="flex items-center gap-2 rounded-full bg-[#00E676] px-8 py-3 font-black text-black shadow-lg transition-all hover:shadow-[0_0_24px_rgba(0,230,118,0.3)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  >
                    {saving ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                        Setting up...
                      </>
                    ) : isLastStep ? (
                      <>
                        <Check className="h-5 w-5" />
                        Let&apos;s Go
                      </>
                    ) : (
                      <>
                        Next
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Skip for optional steps */}
              {!currentStepData.required && (
                <div className="text-center space-y-1">
                  <button
                    onClick={() => { if (!formData.isUploading) { setCurrentStep((prev) => prev + 1); window.scrollTo(0, 0); } }}
                    className={`text-sm transition-colors ${formData.isUploading ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {formData.isUploading ? 'Uploading...' : 'Skip for now'}
                  </button>
                  {currentStepData.id === 'payout' && (
                    <p className="text-xs text-zinc-600">
                      You can connect your payout method in Settings before your first ride.
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}


function validateStep(stepId: string, data: { firstName: string; lastName: string; gender: string; displayName: string; licensePlate: string; plateState: string; handleAvailable: boolean; vehicleMake: string; vehicleModel: string; vehicleYear: string }): boolean {
  if (stepId === 'welcome') return Boolean(data.firstName && data.lastName && data.gender && data.displayName.trim().length >= 2 && data.handleAvailable);
  if (stepId === 'license-plate') return Boolean(data.licensePlate.trim() && data.plateState);
  if (stepId === 'vehicle-details') return Boolean(data.vehicleMake.trim() && data.vehicleModel.trim() && data.vehicleYear.trim());
  return true;
}

async function saveDriverOnboarding(data: {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  licensePlate: string;
  plateState: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  maxAdults: number;
  maxChildren: number;
  gender: string;
  pronouns: string;
  lgbtqFriendly: boolean;
  videoIntroUrl: string;
  videoThumbnailUrl: string;
  adPhotoUrl: string;
  riderPreferences: RiderPreferences;
  stripeConnectId: string;
}): Promise<void> {
  try {
    await fetch('/api/users/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_type: 'driver',
        first_name: data.firstName,
        last_name: data.lastName,
        display_name: data.displayName || `${data.firstName} ${data.lastName.charAt(0)}.`,
        phone: data.phone || null,
        gender: data.gender,
        pronouns: data.pronouns,
        lgbtq_friendly: data.riderPreferences.lgbtqFriendly,
        rider_gender_pref: data.riderPreferences.riderGenderPref,
        require_og_status: data.riderPreferences.requireOgStatus,
        min_rider_chill_score: data.riderPreferences.minRiderChillScore,
        avoid_riders_with_disputes: data.riderPreferences.avoidRidersWithDisputes,
        stripe_connect_id: data.stripeConnectId || null,
        video_url: data.videoIntroUrl || null,
        ad_photo_url: data.adPhotoUrl || null,
        license_plate: data.licensePlate || null,
        plate_state: data.plateState || null,
        vehicle_info: {
          make: data.vehicleMake,
          model: data.vehicleModel,
          year: data.vehicleYear,
          max_adults: data.maxAdults,
          max_children: data.maxChildren,
          license_plate: data.licensePlate,
          plate_state: data.plateState,
        },
      }),
    });

    await fetch('/api/users/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'driver_onboarding_completed',
        properties: {
          hasPayoutMethod: Boolean(data.stripeConnectId),
          minChillScore: data.riderPreferences.minRiderChillScore,
          requireOg: data.riderPreferences.requireOgStatus,
        },
      }),
    }).catch(console.error);
  } catch (error) {
    console.error('Failed to save driver onboarding:', error);
    throw error;
  }
}

function AdPhotoStep({ photoUrl, onUploaded, onUploadStateChange }: { photoUrl: string; onUploaded: (url: string) => void; onUploadStateChange?: (uploading: boolean) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    onUploadStateChange?.(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('profile_type', 'driver');
      formData.append('media_type', 'photo');
      formData.append('save_to_profile', 'false');

      const res = await fetch('/api/upload/video', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Upload failed'); return; }
      onUploaded(data.url);
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      onUploadStateChange?.(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
        <div className="flex gap-3">
          <span className="text-xl mt-0.5">{'\uD83D\uDCF8'}</span>
          <div className="text-sm text-zinc-400">
            <strong className="text-zinc-200">This shows on your HMU link.</strong>{' '}
            Vehicle photo, promo card, flyer — whatever gets riders to book you.
          </div>
        </div>
      </div>

      {uploading && (
        <div className="rounded-xl border-2 border-[#00E676]/30 bg-zinc-900 p-6 text-center">
          <div style={{ width: 24, height: 24, border: '2px solid #00E676', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          <div className="text-sm text-[#00E676] font-semibold">Uploading photo...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {photoUrl && !uploading ? (
        <div className="space-y-3">
          <div className="rounded-xl overflow-hidden border border-zinc-700">
            <img src={photoUrl} alt="Your ad" style={{ width: '100%', display: 'block' }} />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-xl border-2 border-dashed border-zinc-600 px-4 py-3 text-sm text-zinc-400 hover:border-[#00E676] hover:text-[#00E676] transition-all"
          >
            {uploading ? 'Uploading...' : 'Change Photo'}
          </button>
        </div>
      ) : !uploading ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-xl border-2 border-dashed border-zinc-600 px-6 py-10 text-center hover:border-[#00E676] transition-all"
        >
          <div className="text-3xl mb-2">{'\uD83D\uDCF7'}</div>
          <div className="text-sm font-semibold text-white mb-1">
            {uploading ? 'Uploading...' : 'Tap to upload a photo'}
          </div>
          <div className="text-xs text-zinc-400">
            Vehicle photo, promo card, or advertisement
          </div>
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />

      {error && (
        <div className="rounded-xl bg-red-950 border border-red-800 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

const US_STATES =['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

function VehicleDetailsStep({
  make, model, year, maxAdults, maxChildren, onChange,
}: {
  make: string;
  model: string;
  year: string;
  maxAdults: number;
  maxChildren: number;
  onChange: (updates: Partial<{ vehicleMake: string; vehicleModel: string; vehicleYear: string; maxAdults: number; maxChildren: number }>) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => String(currentYear - i));

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 16, outline: 'none',
    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: '#888', marginBottom: 6, display: 'block', fontWeight: 600,
  };

  const counterStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '10px 16px',
  };

  const counterBtn: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(0,230,118,0.3)',
    background: 'rgba(0,230,118,0.08)', color: '#00E676', fontSize: 20,
    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: 'monospace',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>Make</label>
        <input
          type="text"
          placeholder="e.g. Honda, Toyota, Tesla"
          value={make}
          onChange={e => onChange({ vehicleMake: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Model</label>
        <input
          type="text"
          placeholder="e.g. Accord, Camry, Model 3"
          value={model}
          onChange={e => onChange({ vehicleModel: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Year</label>
        <select
          value={year}
          onChange={e => onChange({ vehicleYear: e.target.value })}
          style={{ ...inputStyle, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'12\' height=\'8\' viewBox=\'0 0 12 8\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1.5L6 6.5L11 1.5\' stroke=\'%23888\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', paddingRight: 40 }}
        >
          <option value="">Select year</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Max Adults</label>
          <div style={counterStyle}>
            <button type="button" style={counterBtn} onClick={() => onChange({ maxAdults: Math.max(1, maxAdults - 1) })}>-</button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>{maxAdults}</span>
            <button type="button" style={counterBtn} onClick={() => onChange({ maxAdults: Math.min(8, maxAdults + 1) })}>+</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Max Children</label>
          <div style={counterStyle}>
            <button type="button" style={counterBtn} onClick={() => onChange({ maxChildren: Math.max(0, maxChildren - 1) })}>-</button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>{maxChildren}</span>
            <button type="button" style={counterBtn} onClick={() => onChange({ maxChildren: Math.min(6, maxChildren + 1) })}>+</button>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#555', textAlign: 'center' }}>
        Riders see this on your card so they know if they&apos;ll fit.
      </div>
    </div>
  );
}

function LicensePlateStep({
  plate,
  state,
  onChange,
}: {
  plate: string;
  state: string;
  onChange: (plate: string, state: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
        <div className="flex gap-3">
          <span className="text-xl mt-0.5">{'\uD83D\uDD12'}</span>
          <div className="text-sm text-zinc-400">
            <strong className="text-zinc-200">For rider safety.</strong>{' '}
            Riders see your plate when you&apos;re close so they can confirm it&apos;s you. Update anytime if you switch cars or rent.
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          License Plate <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={plate}
          onChange={(e) => {
            // Only allow valid plate characters: letters, numbers, spaces, dashes
            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9 \-]/g, '');
            onChange(val, state);
          }}
          placeholder="ABC 1234"
          maxLength={10}
          className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20 uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-mono, Space Mono, monospace)', fontSize: '20px', letterSpacing: '4px' }}
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          State <span className="text-red-400">*</span>
        </label>
        <select
          value={state}
          onChange={(e) => onChange(plate, e.target.value)}
          className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
        >
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {plate && (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-5 text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Rider will see</p>
          <div style={{
            display: 'inline-block', background: '#fff', color: '#000',
            borderRadius: '8px', padding: '10px 20px', border: '3px solid #1a3c8f',
          }}>
            <div style={{ fontSize: '10px', color: '#1a3c8f', fontWeight: 700, textAlign: 'center', marginBottom: '2px' }}>
              {state}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono, Space Mono, monospace)',
              fontSize: '24px', fontWeight: 700, letterSpacing: '3px', lineHeight: 1,
            }}>
              {plate || '---'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmationScreen({ name, onContinue }: { name: string; onContinue: () => void }) {
  const [navigating, setNavigating] = useState(false);
  const colors = ['#00E676', '#FFD600', '#FF4081', '#448AFF', '#E040FB', '#FF6E40', '#00E5FF'];
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 1.5,
    color: colors[i % colors.length],
    size: Math.random() * 8 + 4,
    drift: (Math.random() - 0.5) * 100,
  }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#080808', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes confetti {
          0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; }
        }
        @keyframes scaleIn { 0% { transform: scale(0); } 60% { transform: scale(1.1); } 100% { transform: scale(1); } }
        @keyframes fadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '-20px',
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.5}px`,
            backgroundColor: p.color,
            borderRadius: '2px',
            // @ts-expect-error CSS custom property
            '--drift': `${p.drift}px`,
            animation: `confetti ${2 + Math.random()}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px', maxWidth: '360px' }}>
        <div style={{ animation: 'scaleIn 0.5s ease-out', marginBottom: '24px' }}>
          <div style={{
            width: '96px', height: '96px', borderRadius: '50%',
            background: 'rgba(0,230,118,0.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', margin: '0 auto',
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: '#00E676', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Check className="w-8 h-8 text-black" strokeWidth={3} />
            </div>
          </div>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          fontSize: '40px', lineHeight: 1, color: '#fff',
          marginBottom: '12px',
          animation: 'fadeUp 0.5s ease-out 0.3s both',
        }}>
          YOU&apos;RE LIVE, {name.toUpperCase()}!
        </h1>

        <p style={{
          fontSize: '15px', color: '#888', lineHeight: 1.5,
          marginBottom: '32px',
          animation: 'fadeUp 0.5s ease-out 0.5s both',
        }}>
          Your driver profile is set up. Share your link and start getting ride requests.
        </p>

        <button
          type="button"
          onClick={() => { if (navigating) return; setNavigating(true); onContinue(); }}
          disabled={navigating}
          style={{
            width: '100%', padding: '18px', borderRadius: '100px',
            border: 'none', background: '#00E676', color: '#080808',
            fontWeight: 800, fontSize: '17px', cursor: navigating ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body, DM Sans, sans-serif)',
            animation: 'fadeUp 0.5s ease-out 0.7s both',
            opacity: navigating ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          {navigating ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid #080808', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Loading...
            </>
          ) : 'See My HMU Link'}
        </button>
      </div>
    </div>
  );
}
