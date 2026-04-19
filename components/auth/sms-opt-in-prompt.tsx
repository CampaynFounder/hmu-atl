'use client';

// Dismissible banner shown once to new users (first 30 days after signup) when
// opt_in_sms is FALSE and the conversation_agent flag is ON. Parent gate
// decides eligibility server-side; client just handles interaction.

import { useState } from 'react';
import { posthog } from '@/components/analytics/posthog-provider';

interface Props {
  disclosureText: string;
}

export function SmsOptInPrompt({ disclosureText }: Props) {
  const [state, setState] = useState<'idle' | 'saving' | 'hidden'>('idle');

  async function respond(optIn: boolean) {
    setState('saving');
    posthog.capture('sms_opt_in_responded', { opt_in: optIn });
    try {
      await fetch('/api/users/opt-in-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opt_in: optIn, dismissed: true }),
      });
    } catch {
      // Swallow — dismiss locally regardless. The banner stays gone for this
      // session; server cookie will catch up on next successful request.
    }
    setState('hidden');
  }

  async function dismiss() {
    setState('saving');
    posthog.capture('sms_opt_in_dismissed');
    try {
      await fetch('/api/users/opt-in-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      });
    } catch {
      // swallow
    }
    setState('hidden');
  }

  if (state === 'hidden') return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="max-w-md mx-auto rounded-2xl p-4 shadow-2xl"
        style={{
          background: '#141414',
          border: '1px solid rgba(0,230,118,0.3)',
          pointerEvents: 'auto',
        }}
      >
        <div className="flex items-start gap-2 mb-2">
          <span className="text-lg" aria-hidden>💬</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-white leading-tight">
              Want a welcome text from the HMU team?
            </p>
            <p className="text-[11px] text-white/60 mt-1 leading-snug">
              {disclosureText}
            </p>
          </div>
          <button
            onClick={dismiss}
            disabled={state === 'saving'}
            aria-label="Dismiss"
            className="text-white/40 hover:text-white/80 text-sm leading-none"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => respond(false)}
            disabled={state === 'saving'}
            className="flex-1 text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            No thanks
          </button>
          <button
            onClick={() => respond(true)}
            disabled={state === 'saving'}
            className="flex-1 text-xs font-bold py-2 rounded-lg disabled:opacity-50"
            style={{ background: '#00E676', color: '#080808' }}
          >
            {state === 'saving' ? '…' : 'Yes, text me'}
          </button>
        </div>
      </div>
    </div>
  );
}
