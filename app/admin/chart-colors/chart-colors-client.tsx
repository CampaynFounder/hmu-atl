'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Channel keys mirror the mobile chart's 3 stacked streams.
type Channels = { cash: string; hmuPay: string; delivery: string };
type ChannelKey = keyof Channels;
// Full config: colors + per-stream legend labels + the gradient-blend toggle.
type Palette = Channels & { labels: Channels; gradientBlend: boolean };

const CHANNELS: { key: ChannelKey; label: string; help: string }[] = [
  { key: 'cash', label: 'Cash', help: 'In-person cash collected on pickup' },
  { key: 'hmuPay', label: 'HMU Pay', help: 'Digital deposits + extras (brand stream)' },
  { key: 'delivery', label: 'Delivery', help: 'Store-run / delivery courier earnings' },
];

const PRESETS: { name: string; palette: Channels }[] = [
  { name: 'Refined Neon', palette: { cash: '#FFC400', hmuPay: '#2CFF05', delivery: '#B026FF' } },
  { name: 'Green × Purple', palette: { cash: '#B026FF', hmuPay: '#00FD00', delivery: '#00E5FF' } },
  { name: 'Sophisticated', palette: { cash: '#FBBF24', hmuPay: '#34D399', delivery: '#A78BFA' } },
  { name: 'Classic', palette: { cash: '#FFC107', hmuPay: '#00E676', delivery: '#448AFF' } },
];

const DEFAULT_LABELS: Channels = { cash: 'Fee Free Cash', hmuPay: 'HMU Pay', delivery: 'HMU Deliveries' };
const DEFAULTS: Palette = { ...PRESETS[0].palette, labels: DEFAULT_LABELS, gradientBlend: true };
const HEX_RE = /^#([0-9a-fA-F]{6})$/;

// Mirror the mobile bar fill: vertical gradient, sheen at top → depth at base.
function barGradient(c: string): string {
  return `linear-gradient(to bottom, color-mix(in srgb, ${c}, #fff 40%), ${c} 55%, color-mix(in srgb, ${c}, #000 28%))`;
}

// Mirror the mobile BLEND fill: one continuous gradient through the present
// stream colors, each color centered on its segment band (bottom→top).
function blendGradient(segs: { h: number; color: string }[]): string {
  const total = segs.reduce((a, s) => a + s.h, 0);
  if (!total || !segs.length) return 'transparent';
  const stops: string[] = [`${segs[0].color} 0%`];
  let acc = 0;
  for (const s of segs) {
    const mid = ((acc + s.h / 2) / total) * 100;
    stops.push(`${s.color} ${mid.toFixed(1)}%`);
    acc += s.h;
  }
  stops.push(`${segs[segs.length - 1].color} 100%`);
  return `linear-gradient(to top, ${stops.join(', ')})`;
}

// Sample stack heights for the live preview (px), per bucket, per channel.
const SAMPLE = [
  { cash: 70, hmuPay: 34, delivery: 0 },
  { cash: 17, hmuPay: 6, delivery: 10 },
  { cash: 3, hmuPay: 5, delivery: 0 },
  { cash: 0, hmuPay: 3, delivery: 0 },
  { cash: 40, hmuPay: 22, delivery: 14 },
];

export default function ChartColorsClient() {
  const [palette, setPalette] = useState<Palette>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/chart-colors');
      if (!res.ok) { setError('Failed to load palette'); return; }
      const data = await res.json();
      // Merge over DEFAULTS so an older row (colors only) still hydrates labels
      // + toggle, never leaving them undefined.
      if (data.palette) {
        setPalette({
          ...DEFAULTS,
          ...data.palette,
          labels: { ...DEFAULT_LABELS, ...(data.palette.labels ?? {}) },
        });
      }
    } catch {
      setError('Failed to load palette');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  const allValid = useMemo(
    () => CHANNELS.every((c) => HEX_RE.test(palette[c.key])),
    [palette],
  );

  const setChannel = useCallback((key: ChannelKey, value: string) => {
    // Allow typing; normalize lone hex without '#'.
    let v = value.trim();
    if (v && !v.startsWith('#')) v = `#${v}`;
    setPalette((p) => ({ ...p, [key]: v }));
  }, []);

  const setLabel = useCallback((key: ChannelKey, value: string) => {
    setPalette((p) => ({ ...p, labels: { ...p.labels, [key]: value } }));
  }, []);

  const save = useCallback(async () => {
    if (!allValid) { setError('Each color must be a 6-digit hex like #2CFF05'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/chart-colors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(palette),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.palette) {
          setPalette({
            ...DEFAULTS,
            ...data.palette,
            labels: { ...DEFAULT_LABELS, ...(data.palette.labels ?? {}) },
          });
        }
        showToast('Saved — live on drivers’ next refresh');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Save failed');
      }
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  }, [allValid, palette]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Chart Colors</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Tune the driver earnings-chart stream colors, legend labels, and bar
          style. Changes go live on each driver’s next wallet refresh — no app
          update needed.
        </p>
      </div>

      {toast && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-sm text-green-400">{toast}</div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="text-neutral-500 text-sm">Loading…</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Editor */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Presets</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setPalette((prev) => ({ ...prev, ...p.palette }))}
                  className="flex items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500"
                >
                  <span className="flex">
                    {(['cash', 'hmuPay', 'delivery'] as const).map((k) => (
                      <span key={k} className="h-3 w-3 rounded-full -ml-1 first:ml-0 border border-black/40" style={{ background: p.palette[k] }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>

            <div className="h-px bg-neutral-800" />

            {CHANNELS.map((c) => {
              const val = palette[c.key];
              const valid = HEX_RE.test(val);
              return (
                <div key={c.key} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={valid ? val : '#000000'}
                      onChange={(e) => setChannel(c.key, e.target.value)}
                      className="h-10 w-10 rounded-lg bg-transparent border border-neutral-700 cursor-pointer p-0"
                      aria-label={`${c.label} color`}
                    />
                    <div className="flex-1">
                      <div className="text-sm text-neutral-200">{c.label}</div>
                      <div className="text-[11px] text-neutral-500 leading-snug">{c.help}</div>
                    </div>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setChannel(c.key, e.target.value)}
                      spellCheck={false}
                      className={`w-28 rounded-lg bg-neutral-950 border px-2 py-1.5 text-sm font-mono uppercase ${valid ? 'border-neutral-700 text-neutral-200' : 'border-red-500/60 text-red-400'}`}
                    />
                  </div>
                  {/* Legend label for this stream */}
                  <input
                    type="text"
                    value={palette.labels[c.key]}
                    onChange={(e) => setLabel(c.key, e.target.value)}
                    maxLength={24}
                    placeholder={DEFAULT_LABELS[c.key]}
                    aria-label={`${c.label} legend label`}
                    className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200"
                  />
                </div>
              );
            })}

            <div className="h-px bg-neutral-800" />

            {/* Gradient blend toggle */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={palette.gradientBlend}
                onChange={(e) => setPalette((p) => ({ ...p, gradientBlend: e.target.checked }))}
                className="w-5 h-5 mt-0.5"
              />
              <span>
                <span className="text-sm text-neutral-200">Blend colors across the bar</span>
                <span className="block text-[11px] text-neutral-500 leading-snug">
                  One continuous gradient through the stream colors instead of
                  solid segments. Off = classic per-segment view.
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !allValid}
              className="w-full rounded-lg bg-white text-black text-sm font-semibold py-2.5 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save palette'}
            </button>
          </div>

          {/* Live preview */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-4">Live preview</div>
            <div className="rounded-xl p-4" style={{ background: '#080808' }}>
              {/* Legend — centered, with configurable labels */}
              <div className="flex flex-wrap justify-center gap-4 mb-3">
                {CHANNELS.map((c) => (
                  <div key={c.key} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ background: palette[c.key] }} />
                    <span className="text-[9px] tracking-wide" style={{ color: '#888' }}>{palette.labels[c.key].toUpperCase()}</span>
                  </div>
                ))}
              </div>
              {/* Stacked bars */}
              <div className="flex items-end justify-around gap-2" style={{ height: 130 }}>
                {SAMPLE.map((b, i) => {
                  const segs = (['cash', 'hmuPay', 'delivery'] as const)
                    .filter((k) => b[k] > 0)
                    .map((k) => ({ h: b[k], color: palette[k] }));
                  const total = segs.reduce((a, s) => a + s.h, 0);
                  return palette.gradientBlend ? (
                    <div key={i} style={{ width: 22, height: total, background: blendGradient(segs), borderRadius: '2px 2px 0 0' }} />
                  ) : (
                    <div key={i} className="flex flex-col-reverse" style={{ width: 22 }}>
                      {(['cash', 'hmuPay', 'delivery'] as const).map((k) =>
                        b[k] > 0 ? (
                          <div key={k} style={{ height: b[k], background: barGradient(palette[k]) }} />
                        ) : null,
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 mt-3 leading-snug">
              Bottom→top of each bar: {palette.labels.cash}, {palette.labels.hmuPay}, {palette.labels.delivery}.
              {palette.gradientBlend
                ? ' Blend mode smooths the colors into one another across the stack.'
                : ' Watch for two highly-saturated complements sitting adjacent — they can visually vibrate. A warm anchor between two neons reads cleanest.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
