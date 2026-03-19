'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Welcome } from './welcome';
import { VideoRecorder } from './video-recorder';
import { RatingIntro } from './rating-intro';
import { RiderPreferencesStep, type RiderPreferences } from './rider-preferences';
import { PaymentSetup } from './payment-setup';
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
  const [formData, setFormData] = useState<{
    firstName: string;
    lastName: string;
    displayName: string;
    gender: string;
    pronouns: string;
    lgbtqFriendly: boolean;
    videoIntroUrl: string;
    videoThumbnailUrl: string;
    riderPreferences: RiderPreferences;
    stripeConnectId: string;
  }>({
    firstName: '',
    lastName: '',
    displayName: '',
    gender: '',
    pronouns: '',
    lgbtqFriendly: false,
    videoIntroUrl: '',
    videoThumbnailUrl: '',
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
      title: 'Verify Your Identity 🔒',
      description: 'This info is private — only used for verification & payouts',
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
      id: 'display-name',
      title: 'Choose Your Driver Name 🏷️',
      description: 'This is what riders see — keep it real or get creative',
      component: (
        <DriverNameStep
          displayName={formData.displayName}
          firstName={formData.firstName}
          onChange={(name) => setFormData((prev) => ({ ...prev, displayName: name }))}
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
        />
      ),
      required: false,
    },
    {
      id: 'ratings',
      title: 'How ratings work 📊',
      description: 'The system that keeps the community right',
      component: <RatingIntro userType="driver" />,
      required: false,
    },
    {
      id: 'rider-prefs',
      title: 'Who you ride with 🚗',
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
      id: 'payout',
      title: 'Connect your payout 💸',
      description: 'Optional now — required before your first ride pays out',
      component: (
        <PaymentSetup
          variant="payout"
          onPaymentAdded={(id) => setFormData((prev) => ({ ...prev, stripeConnectId: id }))}
          existingStripeCustomerId={formData.stripeConnectId}
        />
      ),
      required: false,
    },
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const canProceed = currentStepData.required
    ? validateStep(currentStepData.id, formData)
    : true;

  const handleNext = async () => {
    if (isLastStep) {
      await saveDriverOnboarding(formData);
      setShowConfirmation(true);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  if (showConfirmation) {
    return <ConfirmationScreen name={formData.firstName} onContinue={onComplete} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-950 to-zinc-900">
      {/* Progress Bar */}
      <div className="sticky top-0 z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800">
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
                  onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
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

                <button
                  onClick={handleNext}
                  disabled={!canProceed}
                  className="flex items-center gap-2 rounded-full bg-[#00E676] px-8 py-3 font-black text-black shadow-lg transition-all hover:shadow-[0_0_24px_rgba(0,230,118,0.3)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  {isLastStep ? (
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

              {/* Skip for optional steps */}
              {!currentStepData.required && (
                <div className="text-center space-y-1">
                  <button
                    onClick={() => setCurrentStep((prev) => prev + 1)}
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Skip for now
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

function DriverNameStep({
  displayName,
  firstName,
  onChange,
}: {
  displayName: string;
  firstName: string;
  onChange: (name: string) => void;
}) {
  const suggestions = [
    `${firstName} ${firstName.charAt(0)}.`,
    firstName,
    `${firstName} the Driver`,
    `${firstName} ATL`,
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
        <div className="flex gap-3">
          <span className="text-xl mt-0.5">🔒</span>
          <div className="text-sm text-zinc-400">
            <strong className="text-zinc-200">Your legal name stays private.</strong>{' '}
            It&apos;s only used for identity verification and payouts. Riders never see it.
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          Driver Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What riders will see"
          className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
          autoFocus
        />
        <p className="mt-2 text-xs text-zinc-400">
          This shows on your HMU link, booking requests, and ride flow
        </p>
      </div>

      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Quick picks</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={`rounded-full border-2 px-4 py-2 text-sm transition-all ${
                displayName === s
                  ? 'border-[#00E676] bg-[#00E676]/10 text-white'
                  : 'border-zinc-600 text-zinc-300 hover:border-zinc-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {displayName && (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4 text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Preview</p>
          <p className="text-2xl font-black text-white" style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)' }}>
            {displayName}
          </p>
          <p className="text-xs text-zinc-400 mt-1">Doin Cash Rides. HMU ATL!</p>
        </div>
      )}
    </div>
  );
}

function validateStep(stepId: string, data: { firstName: string; lastName: string; gender: string; displayName: string }): boolean {
  if (stepId === 'welcome') return Boolean(data.firstName && data.lastName && data.gender);
  if (stepId === 'display-name') return Boolean(data.displayName.trim());
  return true;
}

async function saveDriverOnboarding(data: {
  firstName: string;
  lastName: string;
  displayName: string;
  gender: string;
  pronouns: string;
  lgbtqFriendly: boolean;
  videoIntroUrl: string;
  videoThumbnailUrl: string;
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
        gender: data.gender,
        pronouns: data.pronouns,
        lgbtq_friendly: data.riderPreferences.lgbtqFriendly,
        rider_gender_pref: data.riderPreferences.riderGenderPref,
        require_og_status: data.riderPreferences.requireOgStatus,
        min_rider_chill_score: data.riderPreferences.minRiderChillScore,
        avoid_riders_with_disputes: data.riderPreferences.avoidRidersWithDisputes,
        stripe_connect_id: data.stripeConnectId || null,
        video_intro_url: data.videoIntroUrl || null,
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

function ConfirmationScreen({ name, onContinue }: { name: string; onContinue: () => void }) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; delay: number; color: string; size: number }>>([]);

  useState(() => {
    const colors = ['#00E676', '#FFD600', '#FF4081', '#448AFF', '#E040FB', '#FF6E40', '#00E5FF'];
    const p = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
    }));
    setParticles(p);
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 overflow-hidden">
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti-piece {
          position: absolute;
          top: 0;
          border-radius: 2px;
          animation: confettiFall 3s ease-in forwards;
        }
        @keyframes scaleIn {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeUp {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .confirm-icon { animation: scaleIn 0.6s ease-out forwards; }
        .confirm-title { animation: fadeUp 0.5s ease-out 0.3s forwards; opacity: 0; }
        .confirm-sub { animation: fadeUp 0.5s ease-out 0.5s forwards; opacity: 0; }
        .confirm-btn { animation: fadeUp 0.5s ease-out 0.7s forwards; opacity: 0; }
      `}</style>

      {/* Confetti */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.5}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      <div className="relative z-10 text-center px-6 max-w-sm">
        {/* Big check */}
        <div className="confirm-icon mb-6">
          <div className="mx-auto w-24 h-24 rounded-full bg-[#00E676]/20 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-[#00E676] flex items-center justify-center">
              <Check className="w-8 h-8 text-black" strokeWidth={3} />
            </div>
          </div>
        </div>

        <h1
          className="confirm-title text-white mb-3"
          style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', fontSize: '44px', lineHeight: '1' }}
        >
          YOU&apos;RE LIVE, {name.toUpperCase()}
        </h1>

        <p className="confirm-sub text-zinc-400 text-base leading-relaxed mb-8">
          Your driver profile is set up. Share your link and start getting ride requests.
        </p>

        <button
          onClick={onContinue}
          className="confirm-btn w-full py-4 rounded-full bg-[#00E676] text-black font-black text-lg transition-all hover:shadow-[0_0_32px_rgba(0,230,118,0.3)] active:scale-95"
          style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
        >
          See My HMU Link
        </button>
      </div>
    </div>
  );
}
