'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoRecorder } from './video-recorder';
import { SafetyPreferences } from './safety-preferences';
import { PaymentSetup } from './payment-setup';
import { Welcome } from './welcome';
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
}

export function RiderOnboarding({ onComplete }: RiderOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
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
    driverGenderPref: 'no_preference' as const,
    requireLgbtqFriendly: false,
    minDriverRating: 4.0,
    requireVerification: false,
    avoidDisputes: true,

    // Payment
    paymentMethodId: '',
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
      id: 'video',
      title: 'Show your face 📹',
      description: "Record a quick 5-second intro video so drivers know who they're picking up",
      component: (
        <VideoRecorder
          onVideoRecorded={(videoUrl, thumbnailUrl) => {
            setFormData({ ...formData, videoUrl, thumbnailUrl });
          }}
          existingVideoUrl={formData.videoUrl}
        />
      ),
      required: true,
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
            minDriverRating: formData.minDriverRating,
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
      description: 'You won't be charged until your ride is complete',
      component: (
        <PaymentSetup
          onPaymentAdded={(paymentMethodId) => {
            setFormData({ ...formData, paymentMethodId });
          }}
          existingPaymentMethodId={formData.paymentMethodId}
        />
      ),
      required: true,
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
                <div className="text-center">
                  <button
                    onClick={() => setCurrentStep((prev) => prev + 1)}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Skip for now
                  </button>
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
      return Boolean(data.firstName && data.gender);
    case 'video':
      return Boolean(data.videoUrl);
    case 'payment':
      return Boolean(data.paymentMethodId);
    default:
      return true;
  }
}

// Save to backend
async function saveOnboardingData(data: any): Promise<void> {
  try {
    const res = await fetch('/api/users/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      throw new Error('Failed to save onboarding data');
    }

    // Track onboarding completion
    await fetch('/api/users/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'profile_completed',
        properties: {
          hasVideo: Boolean(data.videoUrl),
          hasPayment: Boolean(data.paymentMethodId),
          safetyPrefsSet: Boolean(data.driverGenderPref !== 'no_preference'),
        },
      }),
    });
  } catch (error) {
    console.error('Failed to save onboarding:', error);
    throw error;
  }
}
