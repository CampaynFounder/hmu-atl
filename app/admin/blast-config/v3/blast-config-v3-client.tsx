'use client';

// Stream E — no-code admin config client.
// Per BLAST-V3-AGENT-CONTRACT.md §3 D-5: ZERO JSON editors. Every control is
// a slider, toggle, stepper, dropdown, or chip. Auto-normalize weights to 1.0
// on save. Per-market tabs (slug NULL = global default).

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import { SuccessCheckmark, ShimmerSlot } from '@/components/blast/motion';
import { REWARD_FUNCTIONS, REWARD_FUNCTION_LABELS } from '@/lib/blast/reward';
import type { RewardFunction } from '@/lib/blast/types';

interface MarketRow { slug: string; name: string }

type Weights = Record<string, number>;
type HardFilters = Record<string, unknown>;
type Limits = Record<string, number | boolean>;

interface ConfigPayload {
  weights: Weights;
  hardFilters: HardFilters;
  limits: Limits;
  rewardFunction: RewardFunction;
  counterOfferMaxPct: number;
  feedMinScorePercentile: number;
  nlpChipOnly: boolean;
  configVersion: number;
}

const SIGNALS: { key: string; label: string; category: 'proximity' | 'trust' | 'preference' | 'behavioral' }[] = [
  { key: 'proximity_to_pickup', label: 'Proximity to pickup', category: 'proximity' },
  { key: 'last_location_recency', label: 'Recent location activity', category: 'proximity' },
  { key: 'rating', label: 'Driver rating', category: 'trust' },
  { key: 'chill_score', label: 'Chill score', category: 'trust' },
  { key: 'completed_rides', label: 'Completed rides', category: 'trust' },
  { key: 'sex_match', label: 'Matches rider gender preference', category: 'preference' },
  { key: 'recency_signin', label: 'Recently signed in', category: 'behavioral' },
  { key: 'low_recent_pass_rate', label: 'Low recent pass rate', category: 'behavioral' },
  { key: 'profile_view_count', label: 'Profile views (popularity)', category: 'behavioral' },
];

const CATEGORY_COLOR: Record<string, string> = {
  proximity: '#00E676',
  trust: '#448AFF',
  preference: '#A855F7',
  behavioral: '#FFB300',
};

const PRESETS: { id: string; label: string; weights: Weights }[] = [
  {
    id: 'speed_first', label: 'Speed-first',
    weights: { proximity_to_pickup: 0.50, last_location_recency: 0.20, recency_signin: 0.15, rating: 0.05, chill_score: 0.05, completed_rides: 0.02, sex_match: 0.01, low_recent_pass_rate: 0.01, profile_view_count: 0.01 },
  },
  {
    id: 'quality_first', label: 'Quality-first',
    weights: { rating: 0.30, chill_score: 0.25, completed_rides: 0.15, proximity_to_pickup: 0.15, recency_signin: 0.05, sex_match: 0.05, low_recent_pass_rate: 0.03, last_location_recency: 0.01, profile_view_count: 0.01 },
  },
  {
    id: 'balanced', label: 'Balanced',
    weights: { proximity_to_pickup: 0.30, recency_signin: 0.15, last_location_recency: 0.10, sex_match: 0.10, chill_score: 0.10, profile_view_count: 0.05, completed_rides: 0.05, rating: 0.10, low_recent_pass_rate: 0.05 },
  },
  {
    id: 'accept_rate', label: 'Accept-rate optimizer',
    weights: { recency_signin: 0.30, last_location_recency: 0.20, low_recent_pass_rate: 0.20, proximity_to_pickup: 0.15, rating: 0.05, chill_score: 0.05, sex_match: 0.02, completed_rides: 0.02, profile_view_count: 0.01 },
  },
];

const HARD_FILTER_DEFS: { key: string; label: string; type: 'toggle' | 'stepper' }[] = [
  { key: 'must_match_sex_preference', label: 'Strictly match rider gender preference', type: 'toggle' },
  { key: 'exclude_if_in_active_ride', label: 'Skip drivers in an active ride', type: 'toggle' },
  { key: 'must_be_signed_in_within_hours', label: 'Driver must have signed in within (hours)', type: 'stepper' },
  { key: 'min_chill_score', label: 'Minimum chill score', type: 'stepper' },
  { key: 'exclude_if_today_passed_count_gte', label: 'Skip if passed ≥ N today', type: 'stepper' },
];

const LIMIT_DEFS: { key: string; label: string; min: number; max: number; step?: number }[] = [
  { key: 'max_drivers_to_notify', label: 'Max drivers notified', min: 1, max: 30 },
  { key: 'min_drivers_to_notify', label: 'Min drivers (auto-expand radius)', min: 1, max: 20 },
  { key: 'expand_radius_step_mi', label: 'Radius expansion step (mi)', min: 0.5, max: 5, step: 0.5 },
  { key: 'expand_radius_max_mi', label: 'Maximum radius (mi)', min: 5, max: 50 },
  { key: 'same_driver_dedupe_minutes', label: 'Dedupe driver for N minutes', min: 0, max: 360 },
];

export interface BlastConfigV3ClientProps {
  markets: MarketRow[];
  canEdit: boolean;
}

export function BlastConfigV3Client({ markets, canEdit }: BlastConfigV3ClientProps) {
  const [marketSlug, setMarketSlug] = useState<string | null>(null); // null = global default
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) {
          setConfig(null);
          setError(null);
        }
        const url = `/api/admin/blast-config/v3?market=${marketSlug ?? ''}`;
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          setError('Could not load config.');
          return;
        }
        const body = await res.json();
        if (!cancelled) setConfig(normalize(body));
      } catch {
        if (!cancelled) setError('Network error.');
      }
    })();
    return () => { cancelled = true; };
  }, [marketSlug]);

  async function save() {
    if (!config) return;
    try {
      // Auto-normalize weights to 1.0
      const total = Object.values(config.weights).reduce((s, w) => s + w, 0);
      const normalized: Weights = total > 0
        ? Object.fromEntries(Object.entries(config.weights).map(([k, v]) => [k, v / total]))
        : config.weights;
      const payload = {
        market_slug: marketSlug,
        weights: normalized,
        hard_filters: config.hardFilters,
        limits: config.limits,
        reward_function: config.rewardFunction,
        counter_offer_max_pct: config.counterOfferMaxPct,
        feed_min_score_percentile: config.feedMinScorePercentile,
        nlp_chip_only: config.nlpChipOnly,
        reason: reason.trim() || null,
      };
      const res = await fetch('/api/admin/blast-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError('Save failed.');
        return;
      }
      const body = await res.json();
      setConfig({ ...config, weights: normalized, configVersion: body.configVersion });
      setSavedTick((t) => t + 1);
      setReason('');
      posthog.capture('admin_blast_config_changed', {
        market_slug: marketSlug,
        version: body.configVersion,
      });
    } catch {
      setError('Network error.');
    }
  }

  function applyPreset(presetId: string) {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p || !config) return;
    setConfig({ ...config, weights: p.weights });
  }

  const normalizedTotal = useMemo(() =>
    config ? Object.values(config.weights).reduce((s, w) => s + w, 0) : 0,
    [config],
  );

  return (
    <div style={{ padding: 24, color: '#fff', fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      <h1 style={H1}>Blast Matching Config</h1>
      <p style={SUB}>
        No JSON. Adjust matching with sliders + toggles. Saved settings take effect on the next blast.
      </p>

      {/* Market tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '20px 0 12px' }}>
        <MarketTab active={marketSlug === null} onClick={() => setMarketSlug(null)}>
          Global Default
        </MarketTab>
        {markets.map((m) => (
          <MarketTab key={m.slug} active={marketSlug === m.slug} onClick={() => setMarketSlug(m.slug)}>
            {m.name}
          </MarketTab>
        ))}
      </div>

      {error && <p style={{ color: '#FF8A8A' }}>{error}</p>}

      {!config && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ShimmerSlot height={64} radius={12} />
          <ShimmerSlot height={300} radius={16} />
        </div>
      )}

      {config && (
        <>
          {/* Presets */}
          <Card title="Quick Presets">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRESETS.map((p) => (
                <Chip key={p.id} onClick={() => applyPreset(p.id)} disabled={!canEdit}>{p.label}</Chip>
              ))}
            </div>
          </Card>

          {/* Weights */}
          <Card title={`Signal Weights (sum: ${(normalizedTotal * 100).toFixed(0)}%)`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {SIGNALS.map((s) => {
                const v = config.weights[s.key] ?? 0;
                const pct = normalizedTotal > 0 ? (v / normalizedTotal) * 100 : 0;
                const color = CATEGORY_COLOR[s.category];
                return (
                  <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, color: '#fff' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color, marginRight: 8 }} />
                        {s.label}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 13, color, fontWeight: 700 }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0} max={100} step={1}
                      value={Math.round(v * 100)}
                      onChange={(e) => setConfig({ ...config, weights: { ...config.weights, [s.key]: Number(e.target.value) / 100 } })}
                      disabled={!canEdit}
                      style={{ width: '100%', accentColor: color }}
                      aria-label={s.label}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Hard filters */}
          <Card title="Hard Filters">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {HARD_FILTER_DEFS.map((f) => {
                const v = config.hardFilters[f.key];
                if (f.type === 'toggle') {
                  return (
                    <Toggle key={f.key} label={f.label} value={!!v} disabled={!canEdit}
                      onChange={(next) => setConfig({ ...config, hardFilters: { ...config.hardFilters, [f.key]: next } })} />
                  );
                }
                return (
                  <Stepper key={f.key} label={f.label} value={Number(v ?? 0)} min={0} max={999999}
                    disabled={!canEdit}
                    onChange={(next) => setConfig({ ...config, hardFilters: { ...config.hardFilters, [f.key]: next } })} />
                );
              })}
            </div>
          </Card>

          {/* Limits */}
          <Card title="Limits">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {LIMIT_DEFS.map((l) => (
                <Stepper key={l.key} label={l.label} value={Number(config.limits[l.key] ?? 0)}
                  min={l.min} max={l.max} step={l.step ?? 1} disabled={!canEdit}
                  onChange={(next) => setConfig({ ...config, limits: { ...config.limits, [l.key]: next } })} />
              ))}
            </div>
          </Card>

          {/* Per-market knobs */}
          <Card title="Market Knobs">
            <Stepper label="Counter-offer max ±%" value={Math.round(config.counterOfferMaxPct * 100)}
              min={0} max={100} suffix="%" disabled={!canEdit}
              onChange={(next) => setConfig({ ...config, counterOfferMaxPct: next / 100 })} />
            <div style={{ height: 12 }} />
            <Stepper label="Feed minimum score percentile" value={config.feedMinScorePercentile}
              min={0} max={100} suffix="%" disabled={!canEdit}
              onChange={(next) => setConfig({ ...config, feedMinScorePercentile: next })} />
            <div style={{ height: 12 }} />
            <div>
              <label style={LABEL}>Reward function (optimizer target)</label>
              <select
                value={config.rewardFunction}
                onChange={(e) => setConfig({ ...config, rewardFunction: e.target.value as RewardFunction })}
                disabled={!canEdit}
                style={SELECT}
              >
                {REWARD_FUNCTIONS.map((rf) => (
                  <option key={rf} value={rf}>{REWARD_FUNCTION_LABELS[rf]}</option>
                ))}
              </select>
            </div>
            <div style={{ height: 12 }} />
            <Toggle label="Disable LLM date parser (cost-saver — chip picker only)"
              value={config.nlpChipOnly} disabled={!canEdit}
              onChange={(next) => setConfig({ ...config, nlpChipOnly: next })} />
          </Card>

          {/* Save */}
          {canEdit && (
            <Card title="Save Changes">
              <input
                type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Optional: reason for this change (logged in audit)"
                style={INPUT}
              />
              <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                <motion.button
                  type="button" onClick={save}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={PRIMARY}
                >
                  Save (v{config.configVersion + 1})
                </motion.button>
                {savedTick > 0 && <SuccessCheckmark size={28} key={savedTick} />}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function normalize(body: unknown): ConfigPayload {
  const b = body as Partial<ConfigPayload> & { weights?: Weights; hardFilters?: HardFilters; limits?: Limits };
  return {
    weights: b.weights ?? {},
    hardFilters: b.hardFilters ?? {},
    limits: b.limits ?? {},
    rewardFunction: (b.rewardFunction ?? 'revenue_per_blast') as RewardFunction,
    counterOfferMaxPct: typeof b.counterOfferMaxPct === 'number' ? b.counterOfferMaxPct : 0.25,
    feedMinScorePercentile: typeof b.feedMinScorePercentile === 'number' ? b.feedMinScorePercentile : 0,
    nlpChipOnly: !!b.nlpChipOnly,
    configVersion: typeof b.configVersion === 'number' ? b.configVersion : 1,
  };
}

function MarketTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '10px 16px', borderRadius: 100,
      border: '1.5px solid', borderColor: active ? '#00E676' : 'rgba(255,255,255,0.12)',
      background: active ? 'rgba(0,230,118,0.15)' : 'transparent',
      color: active ? '#00E676' : 'rgba(255,255,255,0.78)',
      fontSize: 14, fontWeight: 600, cursor: 'pointer',
      fontFamily: 'inherit',
    }}>{children}</button>
  );
}

function Chip({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <motion.button type="button" onClick={onClick} disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      style={{
        padding: '8px 14px', borderRadius: 14,
        border: '1.5px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        color: 'rgba(255,255,255,0.78)',
        fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
      }}>{children}</motion.button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: 18, borderRadius: 16, marginTop: 14,
      background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px', borderRadius: 10,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: disabled ? 0.6 : 1,
    }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} disabled={disabled}
        style={{ accentColor: '#00E676', width: 18, height: 18, flexShrink: 0 }} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
  );
}

function Stepper({ label, value, onChange, min, max, step = 1, suffix, disabled }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string; disabled?: boolean }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={disabled} style={STEPPER_BTN}>−</button>
        <span style={{ minWidth: 60, textAlign: 'center', fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 16, fontWeight: 700 }}>
          {value}{suffix}
        </span>
        <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={disabled} style={STEPPER_BTN}>+</button>
      </div>
    </div>
  );
}

const H1: React.CSSProperties = { fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 32, margin: 0 };
const SUB: React.CSSProperties = { fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' };
const LABEL: React.CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: 600 };
const SELECT: React.CSSProperties = {
  width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', fontSize: 14, fontFamily: 'inherit',
};
const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', fontSize: 14, fontFamily: 'inherit',
};
const PRIMARY: React.CSSProperties = {
  padding: '12px 24px', borderRadius: 100, background: '#00E676', color: '#080808',
  fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
};
const STEPPER_BTN: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.04)', color: '#00E676', fontSize: 18, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
};
