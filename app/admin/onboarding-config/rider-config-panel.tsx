'use client';

// Admin form for the rider ad-funnel onboarding config.
// Edits platform_config['onboarding.rider_ad_funnel'] via /api/admin/
// onboarding-config/rider. Visual language matches onboarding-config-client
// (the driver panel) so the tabs feel like one surface.

import { useEffect, useState, useCallback } from 'react';
import type { RiderAdFunnelConfig } from '@/lib/onboarding/rider-ad-funnel-config';
import type { FieldVisibility } from '@/lib/onboarding/config';

interface FieldRow {
  key: keyof RiderAdFunnelConfig['fields'];
  label: string;
  hint: string;
}

const FIELD_ROWS: FieldRow[] = [
  { key: 'handle',       label: 'Handle',                 hint: 'Globally unique. Drives masking + future @-mentions.' },
  { key: 'media',        label: 'Photo or video',         hint: 'Helps drivers spot the rider at pickup.' },
  { key: 'location',     label: 'Enable location',        hint: 'Browser geo prompt; deferring means asking at first ride.' },
  { key: 'safetyChecks', label: 'In-ride safety checks',  hint: 'Mid-ride "Are you OK?" pings. Persists to user_preferences.' },
];

const VISIBILITY_OPTS: { value: FieldVisibility; label: string; tone: string }[] = [
  { value: 'required', label: 'Required', tone: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { value: 'optional', label: 'Optional', tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'deferred', label: 'Deferred', tone: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { value: 'hidden',   label: 'Hidden',   tone: 'bg-neutral-700/40 text-neutral-300 border-neutral-600' },
];

export default function RiderConfigPanel() {
  const [config, setConfig] = useState<RiderAdFunnelConfig | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/onboarding-config/rider');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config as RiderAdFunnelConfig);
        setMeta({ updatedAt: data.updated_at, updatedBy: data.updated_by });
      } else {
        setError('Failed to load config');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/onboarding-config/rider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setToast('Saved');
        window.setTimeout(() => setToast(null), 2000);
        fetchConfig();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Save failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }, [config, fetchConfig]);

  if (loading || !config) {
    return <div className="text-neutral-500 text-sm">Loading…</div>;
  }

  function setField(key: keyof RiderAdFunnelConfig['fields'], v: FieldVisibility) {
    setConfig(c => c ? { ...c, fields: { ...c.fields, [key]: v } } : c);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Rider Ad-Funnel Onboarding</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Drives <code className="bg-neutral-800 px-1 rounded">/r/express</code>, the paid-ads landing for new riders.
          The standard rider onboarding and the chat-funnel variant are unaffected.
        </p>
        {meta.updatedAt && (
          <p className="text-[11px] text-neutral-600 mt-2">
            Last updated {new Date(meta.updatedAt).toLocaleString()} {meta.updatedBy ? `by ${meta.updatedBy}` : ''}
          </p>
        )}
      </div>

      {toast && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-sm text-green-400">{toast}</div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Ad-funnel mode</h2>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig(c => c ? { ...c, enabled: e.target.checked } : c)}
            />
            Enabled
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          When off, /r/express still renders but the disabled flag can be read by the landing client to swap copy or send users to the standard funnel.
        </p>
      </section>

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h2 className="font-semibold text-white mb-3">Field visibility</h2>
        <div className="space-y-3">
          {FIELD_ROWS.map(row => (
            <div key={row.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 sm:items-center">
              <div>
                <div className="text-sm font-medium text-white">{row.label}</div>
                <div className="text-[11px] text-neutral-500">{row.hint}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {VISIBILITY_OPTS.map(opt => {
                  const active = config.fields[row.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setField(row.key, opt.value)}
                      className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-md border transition-colors ${active ? opt.tone : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-white mb-1">Confirmation CTA label</div>
          <input
            type="text"
            maxLength={40}
            value={config.confirmationCta}
            onChange={e => setConfig(c => c ? { ...c, confirmationCta: e.target.value } : c)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
          />
          <div className="text-[11px] text-neutral-500 mt-1">Shown on the final onboarding screen.</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-white mb-1">Browse route</div>
          <input
            type="text"
            value={config.browseRoute}
            onChange={e => setConfig(c => c ? { ...c, browseRoute: e.target.value } : c)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white font-mono"
          />
          <div className="text-[11px] text-neutral-500 mt-1">Where the CTA routes. Must start with /.</div>
        </div>
      </section>

      <div className="flex gap-2 sticky bottom-0 bg-neutral-950/90 backdrop-blur py-3 -mx-4 px-4 border-t border-neutral-800">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#00E676] hover:bg-[#00E676]/90 disabled:bg-neutral-700 disabled:text-neutral-400 text-black font-semibold text-sm px-5 py-2 rounded-lg"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={fetchConfig}
          disabled={saving}
          className="text-sm text-neutral-400 hover:text-white px-3 py-2"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
