'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formData, setFormData] = useState<{
    firstName: string;
    lastName: string;
    displayName: string;
    gender: string;
    pronouns: string;
    lgbtqFriendly: boolean;
  }>({
    firstName: '',
    lastName: '',
    displayName: '',
    gender: '',
    pronouns: '',
    lgbtqFriendly: false,
  });

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to HMU ATL 👋',
      description: 'Safe rides at fair prices',
      component: (
        <Welcome
          onNext={() => setCurrentStep(1)}
          userType="rider"
          data={formData}
          onChange={(data) => setFormData((prev) => ({ ...prev, ...data }))}
        />
      ),
      required: true,
    },
    {
      id: 'display-name',
      title: 'Choose Your Rider Name 🏷️',
      description: 'This is what drivers see when you book',
      component: (
        <RiderNameStep
          displayName={formData.displayName}
          firstName={formData.firstName}
          onChange={(name) => setFormData((prev) => ({ ...prev, displayName: name }))}
        />
      ),
      required: true,
    },
    {
      id: 'ratings',
      title: 'How Ratings Work 📊',
      description: 'The system that keeps every ride safe',
      component: <RatingIntro userType="rider" />,
      required: false,
    },
    {
      id: 'trust',
      title: 'Your Safety Matters 🛡️',
      description: 'Here\'s how we keep you safe',
      component: <TrustInfo />,
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
      await saveRiderOnboarding(formData);
      setShowConfirmation(true);
    } else {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  if (showConfirmation) {
    return <RiderConfirmation name={formData.displayName || formData.firstName} onContinue={onComplete} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-950 to-zinc-900">
      {/* Progress Bar */}
      <div className="sticky top-0 z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-full bg-[#00E676]/20 px-3 py-1 text-xs font-bold text-[#00E676] uppercase tracking-wide">
              Rider Account
            </span>
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

              {!currentStepData.required && (
                <div className="text-center">
                  <button
                    onClick={() => { setCurrentStep((prev) => prev + 1); window.scrollTo(0, 0); }}
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
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

function RiderNameStep({
  displayName, firstName, onChange,
}: { displayName: string; firstName: string; onChange: (name: string) => void }) {
  const suggestions = [firstName, `${firstName} ${firstName.charAt(0)}.`, `${firstName} ATL`];

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
        <div className="flex gap-3">
          <span className="text-xl mt-0.5">🔒</span>
          <div className="text-sm text-zinc-400">
            <strong className="text-zinc-200">Your legal name stays private.</strong>{' '}
            Drivers only see your display name.
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-white mb-2">
          Display Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What drivers will see"
          className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
          autoFocus
        />
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
    </div>
  );
}

function TrustInfo() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <p className="text-sm text-zinc-400">Every driver on HMU ATL is</p>
      </div>
      {[
        { icon: '🪪', title: 'Identity Verified', desc: 'Government ID verified through Stripe before they can accept rides' },
        { icon: '🎥', title: 'Video Confirmed', desc: 'Drivers record a video intro so you know who\'s pulling up' },
        { icon: '⭐', title: 'Community Rated', desc: 'CHILL, Cool AF, or flagged — every ride is rated by riders like you' },
        { icon: '📍', title: 'GPS Tracked', desc: 'Every ride is tracked in real-time with location history saved' },
        { icon: '💳', title: 'Payment Secured', desc: 'Your payment is held until the ride is complete — never charged early' },
      ].map((item) => (
        <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-700">
          <span className="text-2xl flex-shrink-0">{item.icon}</span>
          <div>
            <div className="font-semibold text-white text-sm">{item.title}</div>
            <div className="text-xs text-zinc-400 mt-1">{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RiderConfirmation({ name, onContinue }: { name: string; onContinue: () => void }) {
  const colors = ['#00E676', '#FFD600', '#FF4081', '#448AFF', '#E040FB'];
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 1.5,
    color: colors[i % colors.length], drift: (Math.random() - 0.5) * 100,
  }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#080808', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes rconfetti { 0% { transform: translateY(-20px) translateX(0) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; } }
        @keyframes rscaleIn { 0% { transform: scale(0); } 60% { transform: scale(1.1); } 100% { transform: scale(1); } }
        @keyframes rfadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {particles.map((p) => (
        <div key={p.id} style={{
          position: 'absolute', top: '-20px', left: `${p.x}%`,
          width: '6px', height: '9px', backgroundColor: p.color, borderRadius: '2px',
          // @ts-expect-error CSS custom property
          '--drift': `${p.drift}px`,
          animation: `rconfetti ${2 + Math.random()}s ease-in ${p.delay}s forwards`,
        }} />
      ))}

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px', maxWidth: '360px' }}>
        <div style={{ animation: 'rscaleIn 0.5s ease-out', marginBottom: '24px' }}>
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
          fontSize: '40px', lineHeight: 1, color: '#fff', marginBottom: '12px',
          animation: 'rfadeUp 0.5s ease-out 0.3s both',
        }}>
          YOU&apos;RE IN, {name.toUpperCase()}!
        </h1>

        <p style={{
          fontSize: '15px', color: '#888', lineHeight: 1.5, marginBottom: '32px',
          animation: 'rfadeUp 0.5s ease-out 0.5s both',
        }}>
          Find a driver, name your price, and get a safe ride at a fair price.
        </p>

        <button
          type="button"
          onClick={onContinue}
          style={{
            width: '100%', padding: '18px', borderRadius: '100px',
            border: 'none', background: '#00E676', color: '#080808',
            fontWeight: 800, fontSize: '17px', cursor: 'pointer',
            fontFamily: 'var(--font-body, DM Sans, sans-serif)',
            animation: 'rfadeUp 0.5s ease-out 0.7s both',
          }}
        >
          Find a Ride
        </button>
      </div>
    </div>
  );
}

function validateStep(stepId: string, data: { firstName: string; lastName: string; gender: string; displayName: string }): boolean {
  if (stepId === 'welcome') return Boolean(data.firstName && data.lastName && data.gender);
  if (stepId === 'display-name') return Boolean(data.displayName.trim());
  return true;
}

async function saveRiderOnboarding(data: {
  firstName: string;
  lastName: string;
  displayName: string;
  gender: string;
  pronouns: string;
  lgbtqFriendly: boolean;
}): Promise<void> {
  try {
    await fetch('/api/users/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_type: 'rider',
        first_name: data.firstName,
        last_name: data.lastName,
        display_name: data.displayName || `${data.firstName} ${data.lastName.charAt(0)}.`,
        gender: data.gender,
        pronouns: data.pronouns,
        lgbtq_friendly: data.lgbtqFriendly,
      }),
    });

    await fetch('/api/users/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'rider_onboarding_completed',
        properties: { displayName: data.displayName },
      }),
    }).catch(console.error);
  } catch (error) {
    console.error('Failed to save rider onboarding:', error);
    throw error;
  }
}
