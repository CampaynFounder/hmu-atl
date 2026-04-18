'use client';

// Dashboard-mounted card. Shows profile X% complete + two CTAs.
// Dismissible (writes user_preferences.checklist_dismissed_at).
// Parent renders this only when the feature flag is ON.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { posthog } from '@/components/analytics/posthog-provider';

interface ActivationItem {
  key: string;
  label: string;
  done: boolean;
}
interface Progress {
  items: ActivationItem[];
  complete: number;
  incomplete: number;
  total: number;
  percent: number;
}

interface Props {
  initiallyDismissed: boolean;
}

export function ProfileCompletionCard({ initiallyDismissed }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [autoFilling, setAutoFilling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (dismissed) return;
    fetch('/api/driver/activation-progress')
      .then(r => (r.ok ? r.json() : null))
      .then((data: Progress | null) => {
        if (data) setProgress(data);
      })
      .catch(() => {});
  }, [dismissed]);

  async function autoFill() {
    setAutoFilling(true);
    try {
      const res = await fetch('/api/driver/activation-progress/auto-fill', { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { applied: { pricing: boolean; schedule: boolean }; progress: Progress };
        setProgress(data.progress);
        posthog.capture('driver_profile_auto_filled', data.applied);
        const applied: string[] = [];
        if (data.applied.pricing) applied.push('pricing');
        if (data.applied.schedule) applied.push('schedule');
        setToast(applied.length ? `Defaults set for ${applied.join(' & ')}` : 'Nothing to fill');
      } else {
        setToast('Couldn\'t auto-fill — try manually');
      }
    } catch {
      setToast('Network error');
    } finally {
      setAutoFilling(false);
      setTimeout(() => setToast(null), 2400);
    }
  }

  async function dismiss() {
    setDismissed(true);
    posthog.capture('driver_profile_card_dismissed');
    await fetch('/api/driver/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist_dismissed_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  if (dismissed || !progress || progress.percent === 100) return null;

  return (
    <div
      className="rounded-2xl p-5 mx-4 mt-3 relative"
      style={{
        background: 'linear-gradient(135deg, rgba(0,230,118,0.14), rgba(68,138,255,0.08))',
        border: '1px solid rgba(0,230,118,0.25)',
      }}
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-white/40 hover:text-white/80 transition-colors"
      >
        ✕
      </button>

      <p className="text-[10px] font-bold tracking-[3px] mb-1" style={{ color: '#00E676' }}>
        PROFILE {progress.percent}% COMPLETE
      </p>
      <h3 className="text-lg font-bold text-white mb-2">
        Finish your profile to start getting matched.
      </h3>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress.percent}%`, background: '#00E676' }}
        />
      </div>

      {/* Missing items — list first 3 */}
      <ul className="space-y-1 mb-4">
        {progress.items.filter(i => !i.done).slice(0, 3).map(i => (
          <li key={i.key} className="flex items-center gap-2 text-xs text-white/70">
            <span style={{ color: 'rgba(255,255,255,0.25)' }}>○</span>
            <span>{i.label}</span>
          </li>
        ))}
        {progress.incomplete > 3 && (
          <li className="text-xs text-white/40 pl-5">+{progress.incomplete - 3} more</li>
        )}
      </ul>

      {/* CTAs */}
      <div className="flex gap-2">
        <Link
          href="/driver/profile"
          onClick={() => posthog.capture('driver_profile_finish_clicked', { from: 'dashboard_card' })}
          className="flex-1 text-center text-xs font-bold py-2.5 rounded-lg"
          style={{ background: '#00E676', color: '#080808' }}
        >
          Finish profile →
        </Link>
        <button
          onClick={autoFill}
          disabled={autoFilling}
          className="flex-1 text-xs font-bold py-2.5 rounded-lg disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {autoFilling ? 'Setting…' : 'Let HMU set it up'}
        </button>
      </div>

      {toast && (
        <p className="mt-3 text-xs text-center text-white/70">{toast}</p>
      )}
    </div>
  );
}
