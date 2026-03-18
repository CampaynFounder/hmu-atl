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
  const [formData, setFormData] = useState<{
    firstName: string;
    lastName: string;
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
      title: 'Welcome, Driverpreneur 👋',
      description: 'Your ride, your price, your rules',
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
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

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

function validateStep(stepId: string, data: { firstName: string; lastName: string; gender: string }): boolean {
  if (stepId === 'welcome') return Boolean(data.firstName && data.lastName && data.gender);
  return true;
}

async function saveDriverOnboarding(data: {
  firstName: string;
  lastName: string;
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
