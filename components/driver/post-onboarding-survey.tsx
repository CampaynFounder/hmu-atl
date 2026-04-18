'use client';

// Post-onboarding survey. 2 questions. Mounted in driver dashboard.
// A/B tested via PostHog flag `driver_survey_mode`:
//   - 'required'   → modal blocks dashboard, no skip
//   - 'skippable'  → modal shows, "Maybe later" button re-prompts in 3 days
//   - 'hidden'     → modal never shows (control)
//
// Parent decides whether to render this at all (feature flag + survey_shown_at IS NULL).

import { useEffect, useState } from 'react';
import { posthog } from '@/components/analytics/posthog-provider';

type SurveyMode = 'required' | 'skippable' | 'hidden';

const HOW_HEARD_OPTIONS: { value: string; label: string }[] = [
  { value: 'fb_group', label: 'Facebook group' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'fb_ig_ad', label: 'FB / IG Ad' },
  { value: 'friend', label: 'Friend told me' },
  { value: 'google', label: 'Google search' },
  { value: 'other', label: 'Other' },
];

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'side_income', label: 'Side income' },
  { value: 'full_time', label: 'Full-time driving' },
  { value: 'drive_friends', label: 'Just drive friends' },
  { value: 'exploring', label: 'Still figuring it out' },
];

interface Props {
  onClose: () => void;  // parent hides the component after user resolves survey
}

export function PostOnboardingSurvey({ onClose }: Props) {
  const [mode, setMode] = useState<SurveyMode | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [howHeard, setHowHeard] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const variant = (posthog.getFeatureFlag?.('driver_survey_mode') as SurveyMode | undefined) ?? 'skippable';
    if (variant === 'hidden') {
      onClose();
      return;
    }
    setMode(variant);
    posthog.capture('driver_survey_shown', { variant });
  }, [onClose]);

  if (!mode || mode === 'hidden') return null;

  const canAdvance = step === 1 ? !!howHeard : !!intent;

  async function submit() {
    if (!howHeard || !intent) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/driver/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ how_heard: howHeard, driver_intent: intent }),
      });
      if (res.ok) {
        posthog.capture('driver_survey_completed', { how_heard: howHeard, driver_intent: intent, variant: mode });
        onClose();
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  }

  async function skip() {
    if (mode === 'required') return;
    setSubmitting(true);
    try {
      await fetch('/api/driver/survey/skip', { method: 'POST' });
      posthog.capture('driver_survey_skipped', { variant: mode, step });
    } catch {
      // swallow — we still close locally
    } finally {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-1 mb-4">
            <div
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: step >= 1 ? '#00E676' : 'rgba(255,255,255,0.15)' }}
            />
            <div
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: step >= 2 ? '#00E676' : 'rgba(255,255,255,0.15)' }}
            />
          </div>
          <h2 className="text-xl font-bold text-white">
            {step === 1 ? 'How you hear about HMU?' : 'What you tryna do?'}
          </h2>
          <p className="text-xs text-white/60 mt-1">
            Takes 10 seconds. Helps us send more riders your way.
          </p>
        </div>

        {/* Options */}
        <div className="px-6 py-4 space-y-2">
          {(step === 1 ? HOW_HEARD_OPTIONS : INTENT_OPTIONS).map(opt => {
            const selected = step === 1 ? howHeard === opt.value : intent === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => (step === 1 ? setHowHeard(opt.value) : setIntent(opt.value))}
                className="w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all"
                style={{
                  background: selected ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${selected ? '#00E676' : 'rgba(255,255,255,0.08)'}`,
                  color: selected ? '#00E676' : 'white',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-3">
          {mode === 'skippable' ? (
            <button
              onClick={skip}
              disabled={submitting}
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              Maybe later
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => {
              if (step === 1 && howHeard) setStep(2);
              else if (step === 2 && intent) submit();
            }}
            disabled={!canAdvance || submitting}
            className="px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
            style={{
              background: canAdvance ? '#00E676' : 'rgba(255,255,255,0.08)',
              color: canAdvance ? '#080808' : 'rgba(255,255,255,0.4)',
            }}
          >
            {submitting ? '...' : step === 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
