'use client';

import { useEffect, useState } from 'react';
import {
  RIDER_BROWSE_BANNER_DEFAULTS,
  type RiderBrowseBannerConfig,
} from '@/lib/admin/rider-browse-banner';
import BrowseBanner from '@/components/rider/browse-banner';

export function RiderBrowseBannerClient() {
  const [config, setConfig] = useState<RiderBrowseBannerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/rider-browse-banner')
      .then(r => r.ok ? r.json() : null)
      .then(data => setConfig((data?.config as RiderBrowseBannerConfig) || RIDER_BROWSE_BANNER_DEFAULTS))
      .catch(() => setConfig(RIDER_BROWSE_BANNER_DEFAULTS))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/rider-browse-banner', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setToast(body.error || `Save failed (${res.status})`);
      } else {
        const body = await res.json();
        setConfig(body.config);
        setToast('Saved — live on /rider/browse');
      }
    } catch {
      setToast('Network error');
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  function reset() {
    setConfig(RIDER_BROWSE_BANNER_DEFAULTS);
  }

  if (loading || !config) return <div className="text-sm text-neutral-500 p-6">Loading…</div>;

  const update = <K extends keyof RiderBrowseBannerConfig>(k: K, v: RiderBrowseBannerConfig[K]) =>
    setConfig({ ...config, [k]: v });

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Rider browse banner</h1>
        <p className="text-sm text-neutral-400 mt-1">
          The banner shown at the top of <code className="bg-neutral-800 px-1 rounded">/rider/browse</code>.
          Use it to recruit drivers who land on the page. Hidden for logged-in drivers automatically.
        </p>
      </header>

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-3">Live preview</div>
        <BrowseBanner config={config} />
      </section>

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={e => update('enabled', e.target.checked)}
            className="h-5 w-5 accent-[#00E676]"
          />
          <span className="text-sm text-white font-medium">Banner enabled</span>
          <span className="text-xs text-neutral-500">
            {config.enabled ? 'Showing on /rider/browse' : 'Hidden — page renders without banner'}
          </span>
        </label>

        <Field label="Headline" hint="Big bold line. Max 80 characters.">
          <input
            type="text"
            value={config.headline}
            maxLength={80}
            onChange={e => update('headline', e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00E676]"
          />
        </Field>

        <Field label="Subhead (optional)" hint="Smaller line under the headline. Empty = hide. Max 140 chars.">
          <input
            type="text"
            value={config.subhead}
            maxLength={140}
            placeholder="Leave blank to hide"
            onChange={e => update('subhead', e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00E676]"
          />
        </Field>

        <Field label="CTA text" hint="Button label. Max 32 chars.">
          <input
            type="text"
            value={config.cta_text}
            maxLength={32}
            onChange={e => update('cta_text', e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00E676]"
          />
        </Field>

        <Field label="CTA URL" hint="Internal path (/driver/express) or full https:// URL. javascript: URLs are rejected.">
          <input
            type="text"
            value={config.cta_url}
            onChange={e => update('cta_url', e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00E676] font-mono"
          />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#00E676] text-black font-bold text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          Reset to defaults
        </button>
        {toast && (
          <span className={`text-sm ${toast.startsWith('Saved') ? 'text-[#00E676]' : 'text-[#FF5252]'}`}>
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-white font-medium mb-1">{label}</div>
      {children}
      {hint && <div className="text-xs text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}
