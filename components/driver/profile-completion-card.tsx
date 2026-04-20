'use client';

// Dashboard card shown post-onboarding. Every activation item renders inline
// with its own deep-link CTA to the exact screen that finishes it. Micro-
// animated check state on transitions so drivers see real progress.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';

interface ActivationItem {
  key: string;
  label: string;
  cta: string;
  route: string;
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
        setToast("Couldn't auto-fill — try manually");
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
        className="absolute top-3 right-3 text-white/40 hover:text-white/80 transition-colors z-10"
      >
        ✕
      </button>

      <p className="text-[10px] font-bold tracking-[3px] mb-1" style={{ color: '#00E676' }}>
        PROFILE {progress.percent}% COMPLETE
      </p>
      <h3 className="text-lg font-bold text-white mb-3 pr-6">
        Finish your profile to start getting matched.
      </h3>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: '#00E676' }}
          initial={{ width: 0 }}
          animate={{ width: `${progress.percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      {/* All items inline — no truncation. Each row links to its own screen. */}
      <ul className="space-y-1.5 mb-4">
        {progress.items.map(item => (
          <ActivationRow key={item.key} item={item} />
        ))}
      </ul>

      {/* One-tap defaults for pricing + schedule only */}
      <button
        onClick={autoFill}
        disabled={autoFilling}
        className="w-full text-xs font-bold py-2.5 rounded-lg disabled:opacity-50"
        style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {autoFilling ? 'Setting…' : '⚡ Let HMU set pricing + schedule for me'}
      </button>

      <AnimatePresence>
        {toast && (
          <motion.p
            className="mt-3 text-xs text-center text-white/70"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {toast}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActivationRow({ item }: { item: ActivationItem }) {
  if (item.done) {
    return (
      <li
        className="flex items-center gap-2.5 text-xs py-1.5"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        <motion.span
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 18 }}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: '#00E676', color: '#080808' }}
        >
          ✓
        </motion.span>
        <span className="line-through">{item.label}</span>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={item.route}
        onClick={() => posthog.capture('driver_activation_row_clicked', { key: item.key })}
        className="flex items-center gap-2.5 text-xs py-2 px-1 rounded-md hover:bg-white/5 transition-colors group"
        style={{ color: 'white' }}
      >
        <span
          className="w-5 h-5 rounded-full border-2 shrink-0 transition-colors group-hover:border-[#00E676]"
          style={{ borderColor: 'rgba(255,255,255,0.3)' }}
          aria-hidden
        />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider transition-colors" style={{ color: 'rgba(0,230,118,0.8)' }}>
          {item.cta} →
        </span>
      </Link>
    </li>
  );
}
