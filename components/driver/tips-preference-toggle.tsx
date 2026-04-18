'use client';

// Opt-out toggle for weekly activation nudges. Writes user_preferences.hide_tips.

import { useEffect, useState } from 'react';
import { posthog } from '@/components/analytics/posthog-provider';

export function TipsPreferenceToggle() {
  const [hideTips, setHideTips] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/driver/preferences')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { hide_tips: boolean } | null) => {
        if (data) setHideTips(Boolean(data.hide_tips));
      })
      .catch(() => {});
  }, []);

  async function toggle() {
    if (hideTips == null) return;
    const next = !hideTips;
    setHideTips(next);
    setSaving(true);
    posthog.capture('driver_hide_tips_toggled', { hide_tips: next });
    await fetch('/api/driver/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hide_tips: next }),
    }).catch(() => {});
    setSaving(false);
  }

  if (hideTips == null) return null;

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div>
        <p className="text-sm font-semibold text-white">
          {hideTips ? 'Tips are off' : 'Tips are on'}
        </p>
        <p className="text-xs text-white/50 mt-0.5">
          {hideTips ? 'We\'ll stop sending weekly nudges.' : 'Weekly nudges when your profile needs work.'}
        </p>
      </div>
      <div
        className="w-10 h-6 rounded-full relative transition-colors"
        style={{ background: hideTips ? 'rgba(255,255,255,0.1)' : '#00E676' }}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
          style={{ left: hideTips ? '2px' : '18px' }}
        />
      </div>
    </button>
  );
}
