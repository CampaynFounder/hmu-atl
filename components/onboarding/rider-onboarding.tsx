'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoRecorder } from './video-recorder';
import { SafetyPreferences, type GenderPreference } from './safety-preferences';
import { PaymentSetup } from './payment-setup';
import { Welcome } from './welcome';
import { RatingIntro } from './rating-intro';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ReactNode;
  required: boolean;
}

interface RiderOnboardingProps {
  onComplete: () => void;
  tier?: string;
}

export function RiderOnboarding({ onComplete, tier = 'free' }: RiderOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<{
    // Profile
    firstName: string;
    lastName: string;
    gender: string;
    pronouns: string;
    lgbtqFriendly: boolean;

    // Video
    videoUrl: string;
    thumbnailUrl: string;

    // Safety Preferences
    driverGenderPref: GenderPreference;
    requireLgbtqFriendly: boolean;
    minDriverChillScore: number;
    requireVerification: boolean;
    avoidDisputes: boolean;

    // Payment
    stripeCustomerId: string;
  }>({
    // Profile
    firstName: '',
    lastName: '',
    gender: '',
    pronouns: '',
    lgbtqFriendly: false,

    // Video
    videoUrl: '',
    thumbnailUrl: '',

    // Safety Preferences
    driverGenderPref: 'no_preference',
    requireLgbtqFriendly: false,
    minDriverChillScore: 0,
    requireVerification: false,
    avoidDisputes: true,

    // Payment
    stripeCustomerId: '',
  });

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to HMU ATL! 👋',
      description: 'Your community rideshare',
      component: (
        <Welcome
          onNext={() => setCurrentStep(1)}
          data={formData}
          onChange={(data) => setFormData({ ...formData, ...data })}
        />
      ),
      required: true,
    },
    {
      id: 'ratings',
      title: 'How ratings work 📊',
      description: 'The system that keeps every ride right',
      component: <RatingIntro userType="rider" />,
      required: false,
    },
    {
      id: 'video',
      title: 'Show your face 📹',
      description: 'Optional — but verified riders get matched 3x faster',
      component: (
        <VideoRecorder
          onVideoRecorded={(videoUrl, thumbnailUrl) => {
            setFormData({ ...formData, videoUrl, thumbnailUrl });
          }}
          existingVideoUrl={formData.videoUrl}
        />
      ),
      required: false,
    },
    {
      id: 'safety',
      title: 'Your safety preferences 🛡️',
      description: 'Tell us who you feel comfortable riding with',
      component: (
        <SafetyPreferences
          preferences={{
            driverGenderPref: formData.driverGenderPref,
            requireLgbtqFriendly: formData.requireLgbtqFriendly,
            minDriverChillScore: formData.minDriverChillScore,
            requireVerification: formData.requireVerification,
            avoidDisputes: formData.avoidDisputes,
          }}
          onChange={(prefs) => setFormData({ ...formData, ...prefs })}
        />
      ),
      required: false,
    },
    {
      id: 'payment',
      title: 'Add payment method 💳',
      description: 'Optional now — required when you book your first ride',
      component: (
        <PaymentSetup
          onPaymentAdded={(stripeCustomerId) => {
            setFormData({ ...formData, stripeCustomerId });
          }}
          existingStripeCustomerId={formData.stripeCustomerId}
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
      // Save all data and complete onboarding
      await saveOnboardingData(formData);
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-purple-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      {/* Progress Bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm dark:bg-zinc-900/80">
        <div className="mx-auto max-w-2xl px-4 py-4">
          {/* Account type badge */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-purple-100 dark:bg-purple-900/50 px-3 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                Rider Account
              </span>
              {tier === 'hmu_first' ? (
                <span className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-xs font-bold text-white">
                  HMU First
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-muted-foreground">
                  Free
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm font-medium">
              {Math.round(((currentStep + 1) / steps.length) * 100)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-800">
            <motion.div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
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
              {/* Step Header */}
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">{currentStepData.title}</h1>
                <p className="text-lg text-muted-foreground">
                  {currentStepData.description}
                </p>
              </div>

              {/* Step Content */}
              <div className="rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-800">
                {currentStepData.component}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className="flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-muted-foreground transition-all hover:bg-gray-100 disabled:opacity-0 dark:hover:bg-zinc-800"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </button>

                <div className="flex gap-2">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-2 w-2 rounded-full transition-all ${
                        index === currentStep
                          ? 'w-8 bg-purple-500'
                          : index < currentStep
                          ? 'bg-purple-300'
                          : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  disabled={!canProceed}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-3 font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {isLastStep ? (
                    <>
                      <Check className="h-5 w-5" />
                      Get Started
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </div>

              {/* Skip Link (for optional steps) */}
              {!currentStepData.required && (
                <div className="text-center space-y-1">
                  <button
                    onClick={() => setCurrentStep((prev) => prev + 1)}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Skip for now
                  </button>
                  {currentStepData.id === 'ratings' && (
                    <p className="text-xs text-muted-foreground">
                      This is important — but you can come back to it anytime.
                    </p>
                  )}
                  {currentStepData.id === 'video' && (
                    <p className="text-xs text-muted-foreground">
                      You can add your video later. Verified riders get matched faster. 🚀
                    </p>
                  )}
                  {currentStepData.id === 'payment' && (
                    <p className="text-xs text-muted-foreground">
                      You&apos;ll be prompted to add a card before your first booking.
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

// Validation helpers
function validateStep(stepId: string, data: any): boolean {
  switch (stepId) {
    case 'welcome':
      return Boolean(data.firstName && data.lastName && data.gender);
    case 'video':
      return Boolean(data.videoUrl);
    case 'payment':
      return Boolean(data.stripeCustomerId);
    default:
      return true;
  }
}

// Save to backend
async function saveOnboardingData(data: any): Promise<void> {
  try {
    // Format data for API
    const payload = {
      profile_type: 'rider',
      first_name: data.firstName,
      last_name: data.lastName,
      gender: data.gender,
      pronouns: data.pronouns,
      lgbtq_friendly: data.lgbtqFriendly,
      video_url: data.videoUrl,
      thumbnail_url: data.thumbnailUrl,
      driver_gender_pref: data.driverGenderPref,
      require_lgbtq_friendly: data.requireLgbtqFriendly,
      min_driver_chill_score: data.minDriverChillScore,
      require_verification: data.requireVerification,
      avoid_disputes: data.avoidDisputes,
      price_range: 'medium',
      stripe_customer_id: data.stripeCustomerId,
    };

    const res = await fetch('/api/users/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to save onboarding data');
    }

    const result = await res.json();

    // Track onboarding completion
    await fetch('/api/users/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'profile_completed',
        properties: {
          hasVideo: Boolean(data.videoUrl),
          hasPayment: Boolean(data.stripeCustomerId),
          safetyPrefsSet: Boolean(data.driverGenderPref !== 'no_preference'),
          accountStatus: result.accountStatus,
        },
      }),
    }).catch(console.error); // Don't fail if analytics fails

    return result;
  } catch (error) {
    console.error('Failed to save onboarding:', error);
    throw error;
  }
}
