'use client';

import { useEffect, useState, useCallback } from 'react';
import type { DriverExpressConfig, FieldVisibility, PricingTier } from '@/lib/onboarding/config';

interface FieldRow {
  key: keyof DriverExpressConfig['fields'];
  label: string;
  hint: string;
}

const FIELD_ROWS: FieldRow[] = [
  { key: 'govName', label: 'Government name', hint: 'Stripe needs this for KYC. Defer to payout step.' },
  { key: 'licensePlate', label: 'License plate', hint: 'Riders verify plate at pickup. Defer until first ride.' },
  { key: 'vehicleMakeModel', label: 'Vehicle make/model', hint: 'Pill-select. Required to get on the feed.' },
  { key: 'vehicleYear', label: 'Vehicle year', hint: 'Optional in express mode.' },
  { key: 'seatMap', label: 'Seat picker', hint: 'Driver checks which seats riders may use.' },
  { key: 'videoIntro', label: 'Video intro', hint: 'Hide for express; deferred to To-Do builds trust later.' },
  { key: 'adPhoto', label: 'HMU ad photo', hint: 'Optional vehicle photo for share link.' },
  { key: 'riderPreferences', label: 'Who you ride with', hint: 'Rider filters — sensitive, defer for trust.' },
  { key: 'location', label: 'Enable location', hint: 'OS permission prompt — defer until OTW.' },
];

const VISIBILITY_OPTS: { value: FieldVisibility; label: string; tone: string }[] = [
  { value: 'required', label: 'Required', tone: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { value: 'optional', label: 'Optional', tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'deferred', label: 'Deferred', tone: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { value: 'hidden', label: 'Hidden', tone: 'bg-neutral-700/40 text-neutral-300 border-neutral-600' },
];

const DAY_OPTS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function OnboardingConfigClient() {
  const [config, setConfig] = useState<DriverExpressConfig | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/onboarding-config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config as DriverExpressConfig);
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
      const res = await fetch('/api/admin/onboarding-config', {
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

  function setField(key: keyof DriverExpressConfig['fields'], v: FieldVisibility) {
    setConfig(c => c ? { ...c, fields: { ...c.fields, [key]: v } } : c);
  }

  function setTier(idx: number, patch: Partial<PricingTier>) {
    setConfig(c => {
      if (!c) return c;
      const next = c.pricingTiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
      return { ...c, pricingTiers: next };
    });
  }

  function setDefaultTier(idx: number) {
    setConfig(c => {
      if (!c) return c;
      const next = c.pricingTiers.map((t, i) => ({ ...t, default: i === idx }));
      return { ...c, pricingTiers: next };
    });
  }

  function toggleDay(d: string) {
    setConfig(c => {
      if (!c) return c;
      const has = c.scheduleDefault.days.includes(d);
      const days = has ? c.scheduleDefault.days.filter(x => x !== d) : [...c.scheduleDefault.days, d];
      const ordered = DAY_OPTS.filter(x => days.includes(x));
      return { ...c, scheduleDefault: { ...c.scheduleDefault, days: ordered } };
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Express Driver Onboarding</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Drives the <code className="bg-neutral-800 px-1 rounded">/driver/express</code> funnel and any signup with{' '}
          <code className="bg-neutral-800 px-1 rounded">mode=express</code>. Deferred fields appear in the Pre-Ride To-Do.
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
          <h2 className="font-semibold text-white">Express mode</h2>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig(c => c ? { ...c, enabled: e.target.checked } : c)}
            />
            Enabled
          </label>
        </div>
        <p className="text-xs text-neutral-500">When off, /driver/express still renders but routes signups through the full flow.</p>
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

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h2 className="font-semibold text-white mb-3">Min-ride pill ladder</h2>
        <p className="text-xs text-neutral-500 mb-3">Driver picks one pill; we cascade to 30min/1hr/2hr defaults.</p>
        <div className="space-y-2">
          {config.pricingTiers.map((t, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                value={t.label}
                onChange={e => setTier(i, { label: e.target.value })}
                className="col-span-2 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
              />
              {(['min','rate30','rate1h','rate2h'] as const).map(k => (
                <div key={k} className="col-span-2">
                  <div className="text-[10px] text-neutral-500 uppercase">{k}</div>
                  <input
                    type="number"
                    value={t[k]}
                    onChange={e => setTier(i, { [k]: Number(e.target.value) } as Partial<PricingTier>)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
                  />
                </div>
              ))}
              <label className="col-span-2 flex items-center gap-2 text-[11px] text-neutral-400 justify-end">
                <input type="radio" checked={!!t.default} onChange={() => setDefaultTier(i)} />
                Default
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-white mb-1">Stops fee ($)</div>
          <input
            type="number"
            value={config.stopsFee}
            onChange={e => setConfig(c => c ? { ...c, stopsFee: Number(e.target.value) } : c)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
          />
        </div>
        <div>
          <div className="text-xs font-semibold text-white mb-1">Wait fee ($/min)</div>
          <input
            type="number"
            value={config.waitPerMin}
            onChange={e => setConfig(c => c ? { ...c, waitPerMin: Number(e.target.value) } : c)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
          />
        </div>
      </section>

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h2 className="font-semibold text-white mb-3">Default schedule</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {DAY_OPTS.map(d => {
            const on = config.scheduleDefault.days.includes(d);
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`text-xs uppercase font-semibold px-3 py-1 rounded-md border ${on ? 'bg-[#00E676]/20 text-[#00E676] border-[#00E676]/40' : 'bg-neutral-950 text-neutral-500 border-neutral-800'}`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-neutral-500 uppercase mb-1">Start</div>
            <input
              type="time"
              value={config.scheduleDefault.start}
              onChange={e => setConfig(c => c ? { ...c, scheduleDefault: { ...c.scheduleDefault, start: e.target.value } } : c)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
            />
          </div>
          <div>
            <div className="text-[10px] text-neutral-500 uppercase mb-1">End</div>
            <input
              type="time"
              value={config.scheduleDefault.end}
              onChange={e => setConfig(c => c ? { ...c, scheduleDefault: { ...c.scheduleDefault, end: e.target.value } } : c)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
            />
          </div>
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
