'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Heart,
  DollarSign,
  MessageCircle,
  Shield,
  ArrowRight,
  X,
  Check,
} from 'lucide-react';
import Confetti from 'react-confetti';
import useWindowSize from 'react-use/lib/useWindowSize';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tip?: string;
  targetElement?: string;
}

interface FirstRideTutorialProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
  userType: 'rider' | 'driver';
}

export function FirstRideTutorial({
  isOpen,
  onComplete,
  onSkip,
  userType,
}: FirstRideTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const { width, height } = useWindowSize();

  const riderSteps: TutorialStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to HMU ATL! 🎉',
      description:
        "You're all set up! Let's show you how to request your first ride and connect with amazing drivers in your community.",
      icon: <Sparkles className="h-12 w-12 text-purple-500" />,
    },
    {
      id: 'browse',
      title: 'Browse Available Drivers',
      description:
        "Swipe through driver profiles to see who's online and accepting rides near you. Each profile shows their video, rating, and why they're a good match for you.",
      icon: <Heart className="h-12 w-12 text-pink-500" />,
      tip: 'Swipe right to request a ride, swipe left to skip',
      targetElement: '[data-tutorial="driver-feed"]',
    },
    {
      id: 'request',
      title: 'Request a Ride',
      description:
        'Tap the purple + button to create a ride request. Set your pickup and dropoff locations, add stops if needed, and name your price. Drivers can accept or counter-offer.',
      icon: <DollarSign className="h-12 w-12 text-green-500" />,
      tip: 'Higher offers get accepted faster!',
      targetElement: '[data-tutorial="request-button"]',
    },
    {
      id: 'safety',
      title: 'Your Safety Comes First',
      description:
        'All drivers are verified and background-checked. You can share your trip with friends, see real-time location tracking, and rate your experience after each ride.',
      icon: <Shield className="h-12 w-12 text-blue-500" />,
      tip: 'Adjust your safety preferences anytime in Settings',
    },
    {
      id: 'ready',
      title: "You're Ready to Ride! 🚗",
      description:
        "That's it! You're all set to request your first ride. Remember, you can message drivers, add notes to your requests, and schedule rides for later.",
      icon: <Check className="h-12 w-12 text-green-500" />,
    },
  ];

  const driverSteps: TutorialStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to HMU ATL! 🎉',
      description:
        "You're all set up! Let's show you how to accept ride requests and start earning in your community.",
      icon: <Sparkles className="h-12 w-12 text-purple-500" />,
    },
    {
      id: 'feed',
      title: 'Browse Ride Requests',
      description:
        'Swipe through rider requests to see pickup/dropoff locations, offer amounts, and rider profiles. Each request shows their video intro and why they match your preferences.',
      icon: <Heart className="h-12 w-12 text-pink-500" />,
      tip: 'Swipe right to accept, swipe left to skip',
      targetElement: '[data-tutorial="rider-feed"]',
    },
    {
      id: 'accept',
      title: 'Accept or Counter Offer',
      description:
        'See an offer you like? Accept it immediately! Think it should be higher? Send a counter-offer. Riders can accept, decline, or counter back.',
      icon: <DollarSign className="h-12 w-12 text-green-500" />,
      tip: 'You can set minimum prices in your preferences',
      targetElement: '[data-tutorial="accept-button"]',
    },
    {
      id: 'communicate',
      title: 'Stay Connected',
      description:
        "Message riders before pickup to confirm details. Share your ETA and let them know when you're close. Good communication leads to better ratings!",
      icon: <MessageCircle className="h-12 w-12 text-blue-500" />,
    },
    {
      id: 'ready',
      title: "You're Ready to Drive! 🚗",
      description:
        "That's it! Go online, browse requests, and start accepting rides. Remember to drive safely and provide amazing service!",
      icon: <Check className="h-12 w-12 text-green-500" />,
    },
  ];

  const steps = userType === 'rider' ? riderSteps : driverSteps;
  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  useEffect(() => {
    if (isLastStep && isOpen) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    }
  }, [isLastStep, isOpen]);

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Confetti */}
          {showConfetti && (
            <div className="pointer-events-none fixed inset-0 z-[100]">
              <Confetti
                width={width}
                height={height}
                recycle={false}
                numberOfPieces={500}
                gravity={0.3}
              />
            </div>
          )}

          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
          />

          {/* Tutorial Card */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              key={currentStep}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl shadow-2xl"
              style={{ background: '#141414', color: '#fff' }}
            >
              {/* Skip Button */}
              {!isLastStep && (
                <button
                  onClick={handleSkip}
                  className="absolute right-4 top-4 z-10 rounded-full p-2 transition-all"
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#bbb' }}
                >
                  <X className="h-5 w-5" />
                </button>
              )}

              {/* Content */}
              <div className="p-8">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', damping: 15 }}
                  className="mb-6 flex justify-center"
                >
                  <div className="rounded-full p-6" style={{ background: 'rgba(168,85,247,0.15)' }}>
                    {currentStepData.icon}
                  </div>
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-4 text-center text-2xl font-bold"
                  style={{ color: '#fff' }}
                >
                  {currentStepData.title}
                </motion.h2>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mb-6 text-center"
                  style={{ color: '#bbb' }}
                >
                  {currentStepData.description}
                </motion.p>

                {/* Tip */}
                {currentStepData.tip && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mb-6 rounded-xl p-4"
                    style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}
                  >
                    <div className="flex gap-3">
                      <Sparkles className="h-5 w-5 shrink-0" style={{ color: '#A855F7' }} />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: '#D8B4FE' }}>
                          Pro Tip
                        </p>
                        <p className="mt-1 text-sm" style={{ color: '#C4B5FD' }}>
                          {currentStepData.tip}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Progress Dots */}
                <div className="mb-6 flex justify-center gap-2">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-2 rounded-full transition-all ${
                        index === currentStep
                          ? 'w-8 bg-gradient-to-r from-purple-500 to-pink-500'
                          : index < currentStep
                          ? 'w-2 bg-green-500'
                          : 'w-2'
                      }`}
                    />
                  ))}
                </div>

                {/* Action Button */}
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  onClick={handleNext}
                  className="w-full rounded-full px-8 py-4 font-bold shadow-lg transition-all hover:shadow-xl active:scale-95"
                  style={{ background: '#00E676', color: '#080808' }}
                >
                  {isLastStep ? (
                    <span className="flex items-center justify-center gap-2">
                      <Check className="h-5 w-5" />
                      Let's Go!
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Next
                      <ArrowRight className="h-5 w-5" />
                    </span>
                  )}
                </motion.button>

                {/* Step Counter */}
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  {currentStep + 1} of {steps.length}
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
