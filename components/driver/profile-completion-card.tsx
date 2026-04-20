'use client';

// Dashboard card shown post-onboarding. Each activation item renders inline
// with its own deep-link CTA to the exact screen that finishes it. Micro-
// animated check state on transitions. Individual rows are dismissible — the
// driver can snooze a nag (e.g. "I'll do video intro later") without losing
// the whole card. Dismissals persist via localStorage.

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

const HIDDEN_KEY = 'hmu_activation_hidden_items';

function readHidden(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(x => typeof x === 'string');
  } catch { /* ignore */ }
  return [];
}

function writeHidden(keys: string[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
}

export function ProfileCompletionCard({ initiallyDismissed }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setHidden(readHidden());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (dismissed) return;
    fetch('/api/driver/activation-progress')
      .then(r => (r.ok ? r.json() : null))
      .then((data: Progress | null) => {
        if (data) setProgress(data);
      })
      .catch(() => {});
  }, [dismissed]);

  function hideRow(key: string) {
    posthog.capture('driver_activation_row_hidden', { key });
    setHidden(prev => {
      const next = prev.includes(key) ? prev : [...prev, key];
      writeHidden(next);
      return next;
    });
  }

  function showAllRows() {
    posthog.capture('driver_activation_rows_restored');
    setHidden([]);
    writeHidden([]);
  }

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

  const visibleItems = hydrated ? progress.items.filter(i => !hidden.includes(i.key)) : progress.items;
  const hiddenCount = hydrated ? hidden.length : 0;

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
        aria-label="Dismiss card"
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

      <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: '#00E676' }}
          initial={{ width: 0 }}
          animate={{ width: `${progress.percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      <ul className="space-y-1 mb-3">
        <AnimatePresence initial={false}>
          {visibleItems.map(item => (
            <motion.li
              key={item.key}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <ActivationRow item={item} onHide={() => hideRow(item.key)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {hiddenCount > 0 && (
        <button
          onClick={showAllRows}
          className="text-[11px] font-semibold mb-3 px-2 py-1 rounded transition-colors hover:bg-white/5"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          {hiddenCount} hidden · show all
        </button>
      )}

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

function ActivationRow({ item, onHide }: { item: ActivationItem; onHide: () => void }) {
  if (item.done) {
    return (
      <div
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
      </div>
    );
  }
  return (
    <div className="group flex items-stretch">
      <Link
        href={item.route}
        onClick={() => posthog.capture('driver_activation_row_clicked', { key: item.key })}
        className="flex-1 flex items-center gap-2.5 text-xs py-2 px-1 rounded-md hover:bg-white/5 transition-colors"
        style={{ color: 'white' }}
      >
        <span
          className="w-5 h-5 rounded-full border-2 shrink-0 transition-colors group-hover:border-[#00E676]"
          style={{ borderColor: 'rgba(255,255,255,0.3)' }}
          aria-hidden
        />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,230,118,0.8)' }}>
          {item.cta} →
        </span>
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
        aria-label={`Hide ${item.label}`}
        className="ml-1 px-2 text-[12px] rounded transition-all opacity-40 hover:opacity-100 hover:bg-white/10 active:scale-90"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        ✕
      </button>
    </div>
  );
}
