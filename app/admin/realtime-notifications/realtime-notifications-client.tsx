'use client';

import { useEffect, useState } from 'react';
import {
  REALTIME_NOTIF_DEFAULTS,
  TYPE_LABELS,
  type AdminRealtimeNotifConfig,
  type AdminRealtimeNotifType,
} from '@/lib/admin/realtime-notifications';

const TYPES: AdminRealtimeNotifType[] = ['user_signup', 'ride_request', 'ride_booking'];

export function RealtimeNotificationsClient() {
  const [config, setConfig] = useState<AdminRealtimeNotifConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/realtime-notifications')
      .then(r => r.ok ? r.json() : null)
      .then(data => setConfig((data?.config as AdminRealtimeNotifConfig) || REALTIME_NOTIF_DEFAULTS))
      .catch(() => setConfig(REALTIME_NOTIF_DEFAULTS))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(type: AdminRealtimeNotifType) {
    if (!config) return;
    const next: AdminRealtimeNotifConfig = { ...config, [type]: !config[type] };
    setConfig(next);
    setSaving(type);
    try {
      const res = await fetch('/api/admin/realtime-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        // Roll back on failure so the UI matches what's persisted.
        setConfig(config);
        const body = await res.json().catch(() => ({}));
        setToast(body.error || `Save failed (${res.status})`);
      } else {
        setToast('Saved');
      }
    } catch {
      setConfig(config);
      setToast('Network error');
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function test(type: AdminRealtimeNotifType) {
    setTesting(type);
    try {
      const res = await fetch('/api/admin/realtime-notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setToast(body.error || `Test failed (${res.status})`);
      } else if (config && !config[type]) {
        setToast('Test sent — type is OFF, so no banner will appear. Toggle it on first.');
      } else {
        setToast('Test event published — banner should pop up shortly');
      }
    } catch {
      setToast('Network error');
    } finally {
      setTesting(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  if (loading || !config) {
    return <div className="text-sm text-neutral-500">Loading…</div>;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Realtime banner notifications</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Pop-up banners shown to super admins inside the admin portal when these
          events fire on the <span className="font-mono">admin:feed</span> channel.
          Use Test to fire a synthetic event end-to-end.
        </p>
      </div>

      <div className="space-y-3">
        {TYPES.map((type) => {
          const meta = TYPE_LABELS[type];
          const enabled = config[type];
          return (
            <div
              key={type}
              className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-start gap-3"
            >
              <div className="text-2xl leading-none">{meta.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => test(type)}
                      disabled={testing !== null}
                      className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
                    >
                      {testing === type ? 'Sending…' : 'Test'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(type)}
                      disabled={saving !== null}
                      aria-pressed={enabled}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                        enabled ? 'bg-[#00E676]' : 'bg-neutral-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">{meta.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="text-xs text-[#00E676] bg-[#00E676]/10 border border-[#00E676]/30 rounded-lg px-3 py-2">
          {toast}
        </div>
      )}

      <div className="text-[11px] text-neutral-500 pt-2 border-t border-neutral-800">
        Banners only render for super admins. Non-super roles can&apos;t toggle this config.
      </div>
    </div>
  );
}
