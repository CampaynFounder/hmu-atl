'use client';

// Admin form for the rider profile-fields config — ride-type list + home-area
// visibility. Edits platform_config['onboarding.rider_profile_fields'] via
// /api/admin/onboarding-config/rider-profile-fields. Visual language matches
// the sibling driver/rider panels so the tabs feel like one surface.

import { useEffect, useState, useCallback } from 'react';
import type { RiderProfileFieldsConfig, RideTypeOption } from '@/lib/onboarding/rider-profile-fields-config';
import type { FieldVisibility } from '@/lib/onboarding/config';

interface FieldRow {
  key: keyof RiderProfileFieldsConfig['fields'];
  label: string;
  hint: string;
}

const FIELD_ROWS: FieldRow[] = [
  { key: 'rideTypes', label: 'Ride types',  hint: 'Multi-select pills (work, errands, kids, turn up, recurring). Helps drivers + future matching.' },
  { key: 'homeArea',  label: 'Home area',   hint: 'Single-select neighborhood (West End, Buckhead, …) from market_areas. Reuses the driver-area chips.' },
];

const VISIBILITY_OPTS: { value: FieldVisibility; label: string; tone: string }[] = [
  { value: 'required', label: 'Required', tone: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { value: 'optional', label: 'Optional', tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'deferred', label: 'Deferred', tone: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { value: 'hidden',   label: 'Hidden',   tone: 'bg-neutral-700/40 text-neutral-300 border-neutral-600' },
];

const SLUG_RE = /^[a-z0-9_]{1,32}$/;

export default function RiderProfileFieldsPanel() {
  const [config, setConfig] = useState<RiderProfileFieldsConfig | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/onboarding-config/rider-profile-fields');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config as RiderProfileFieldsConfig);
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
      const res = await fetch('/api/admin/onboarding-config/rider-profile-fields', {
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

  function setField(key: keyof RiderProfileFieldsConfig['fields'], v: FieldVisibility) {
    setConfig(c => c ? { ...c, fields: { ...c.fields, [key]: v } } : c);
  }

  function patchOption(idx: number, patch: Partial<RideTypeOption>) {
    setConfig(c => {
      if (!c) return c;
      const next = c.rideTypeOptions.map((o, i) => i === idx ? { ...o, ...patch } : o);
      return { ...c, rideTypeOptions: next };
    });
  }

  function removeOption(idx: number) {
    setConfig(c => {
      if (!c) return c;
      const next = c.rideTypeOptions.filter((_, i) => i !== idx);
      // Keep maxRideTypeSelections within bounds.
      const max = Math.min(c.maxRideTypeSelections, Math.max(1, next.length));
      return { ...c, rideTypeOptions: next, maxRideTypeSelections: max };
    });
  }

  function addOption() {
    setConfig(c => {
      if (!c) return c;
      // Generate a unique placeholder slug.
      let i = 1;
      let slug = 'new_type';
      const taken = new Set(c.rideTypeOptions.map(o => o.slug));
      while (taken.has(slug)) { slug = `new_type_${++i}`; }
      const next = [...c.rideTypeOptions, { slug, label: 'New type', emoji: undefined, enabled: true }];
      return { ...c, rideTypeOptions: next };
    });
  }

  function moveOption(idx: number, dir: -1 | 1) {
    setConfig(c => {
      if (!c) return c;
      const target = idx + dir;
      if (target < 0 || target >= c.rideTypeOptions.length) return c;
      const next = [...c.rideTypeOptions];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...c, rideTypeOptions: next };
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Rider Profile Fields</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Drives the ride-type and home-area collection across <code className="bg-neutral-800 px-1 rounded">/r/express</code>,{' '}
          <code className="bg-neutral-800 px-1 rounded">/onboarding?type=rider</code>, and the chat-funnel rider variant.
          One config covers all rider flows.
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
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-white">Ride-type options</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Edit, reorder, or disable. Slugs are written to <code className="bg-neutral-800 px-1 rounded">rider_profiles.ride_types</code> — keep them stable.
            </p>
          </div>
          <button
            onClick={addOption}
            className="text-xs font-semibold bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/40 px-3 py-1.5 rounded-md hover:bg-[#00E676]/25"
          >
            + Add type
          </button>
        </div>

        <div className="space-y-2">
          {config.rideTypeOptions.map((opt, i) => {
            const slugInvalid = !SLUG_RE.test(opt.slug);
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-1 flex flex-col">
                  <button onClick={() => moveOption(i, -1)} disabled={i === 0} className="text-neutral-500 hover:text-white disabled:opacity-20 text-xs">▲</button>
                  <button onClick={() => moveOption(i, 1)} disabled={i === config.rideTypeOptions.length - 1} className="text-neutral-500 hover:text-white disabled:opacity-20 text-xs">▼</button>
                </div>
                <div className="col-span-3">
                  <div className="text-[10px] text-neutral-500 uppercase">Slug</div>
                  <input
                    value={opt.slug}
                    onChange={e => patchOption(i, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    className={`w-full bg-neutral-950 border rounded-md px-2 py-1 text-sm text-white font-mono ${slugInvalid ? 'border-red-500/50' : 'border-neutral-800'}`}
                  />
                </div>
                <div className="col-span-1">
                  <div className="text-[10px] text-neutral-500 uppercase">Emoji</div>
                  <input
                    value={opt.emoji || ''}
                    onChange={e => patchOption(i, { emoji: e.target.value })}
                    placeholder="—"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white text-center"
                  />
                </div>
                <div className="col-span-4">
                  <div className="text-[10px] text-neutral-500 uppercase">Label</div>
                  <input
                    value={opt.label}
                    onChange={e => patchOption(i, { label: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
                  />
                </div>
                <label className="col-span-2 flex items-center gap-2 text-[11px] text-neutral-400 mt-3">
                  <input
                    type="checkbox"
                    checked={opt.enabled}
                    onChange={e => patchOption(i, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <button
                  onClick={() => removeOption(i)}
                  disabled={config.rideTypeOptions.length <= 1}
                  className="col-span-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-30 mt-3"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-neutral-800">
          <div className="text-xs font-semibold text-white mb-1">Max selections per rider</div>
          <input
            type="number"
            min={1}
            max={config.rideTypeOptions.length}
            value={config.maxRideTypeSelections}
            onChange={e => setConfig(c => c ? { ...c, maxRideTypeSelections: Math.max(1, Math.min(c.rideTypeOptions.length, Number(e.target.value) || 1)) } : c)}
            className="w-24 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
          />
          <div className="text-[11px] text-neutral-500 mt-1">
            How many pills the rider can pick. Capped to the number of options above.
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
