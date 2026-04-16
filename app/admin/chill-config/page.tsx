'use client';

import { useEffect, useState, useRef } from 'react';

interface Config {
  coolAfMultiplier: number;
  chillMultiplier: number;
  creepyMultiplier: number;
  weirdoMultiplier: number;
  baseWeight: number;
  minWeight: number;
  coolAfMin: number;
  chillMin: number;
  aightMin: number;
  sketchyMin: number;
  inactivityDays: number;
  decayPerWeek: number;
  decayFloor: number;
  weirdoAutoReviewCount: number;
  retaliationWindowMinutes: number;
}

interface FieldDef {
  key: keyof Config;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  group: string;
}

const FIELDS: FieldDef[] = [
  // Rating impact
  {
    key: 'coolAfMultiplier', label: 'Cool AF Boost', group: 'Rating Impact',
    description: 'How much a "Cool AF" rating increases the score. Higher values let users recover faster from bad ratings. At 0.5, a rider with 5 rides gains ~4.5 points per Cool AF rating.',
    min: 0, max: 2, step: 0.1, unit: '×',
  },
  {
    key: 'chillMultiplier', label: 'CHILL Boost', group: 'Rating Impact',
    description: 'How much a "CHILL" rating (expected good behavior) increases the score. Keep this low — CHILL should be the baseline, not a major boost. At 0.2, it adds ~1.8 points at 5 rides.',
    min: 0, max: 1, step: 0.05, unit: '×',
  },
  {
    key: 'creepyMultiplier', label: 'Kinda Creepy Penalty', group: 'Rating Impact',
    description: 'How much a "Kinda Creepy" rating decreases the score. One Creepy rating should be a warning — noticeable but not devastating. At 1.5, it costs ~13 points at 5 rides.',
    min: 0.5, max: 5, step: 0.1, unit: '×',
  },
  {
    key: 'weirdoMultiplier', label: 'WEIRDO Penalty', group: 'Rating Impact',
    description: 'How much a "WEIRDO" rating decreases the score. This is the nuclear option — safety concerns. At 3.0, it costs ~27 points at 5 rides. Two WEIRDOs can drop a new user from Cool AF to Sketchy.',
    min: 1, max: 10, step: 0.5, unit: '×',
  },

  // Weight formula
  {
    key: 'baseWeight', label: 'Base Weight', group: 'Weight Formula',
    description: 'Controls how much early ratings matter. The formula is: weight = max(minWeight, baseWeight / √totalRides). Higher base weight means early ratings have massive impact. At 20, a user with 1 ride gets weight=20, with 100 rides gets weight=2.',
    min: 5, max: 50, step: 1, unit: '',
  },
  {
    key: 'minWeight', label: 'Minimum Weight', group: 'Weight Formula',
    description: 'The floor for rating impact — ensures ratings always matter at least a little, even after hundreds of rides. At 2, a WEIRDO rating always costs at least 6 points (2 × 3.0).',
    min: 0.5, max: 10, step: 0.5, unit: '',
  },

  // Tier thresholds
  {
    key: 'coolAfMin', label: 'Cool AF Threshold', group: 'Vibe Tiers',
    description: 'Minimum score to earn the "Cool AF 😎" badge. Users above this threshold are shown as top-tier to riders and drivers. Raising this makes Cool AF harder to maintain.',
    min: 80, max: 100, step: 1, unit: 'pts',
  },
  {
    key: 'chillMin', label: 'CHILL Threshold', group: 'Vibe Tiers',
    description: 'Minimum score for "CHILL ✅" badge. This is the default "good standing" tier. Most active users with no issues should sit here. This is also the default matching filter.',
    min: 60, max: 89, step: 1, unit: 'pts',
  },
  {
    key: 'aightMin', label: 'Aight Threshold', group: 'Vibe Tiers',
    description: 'Minimum score for "Aight 🤷" badge. Users here have had some negative feedback but aren\'t flagged. Some drivers may skip Aight-tier riders.',
    min: 35, max: 59, step: 1, unit: 'pts',
  },
  {
    key: 'sketchyMin', label: 'Sketchy Threshold', group: 'Vibe Tiers',
    description: 'Minimum score for "Sketchy 👀" badge. Below this is WEIRDO territory. Users here have significant negative history. Most drivers will not accept rides from Sketchy users.',
    min: 10, max: 40, step: 1, unit: 'pts',
  },

  // Decay rules
  {
    key: 'inactivityDays', label: 'Inactivity Grace Period', group: 'Inactivity Decay',
    description: 'Number of days without a ride before score starts decaying. Prevents ghost accounts from keeping a high score indefinitely. Set higher if your user base rides infrequently.',
    min: 7, max: 90, step: 1, unit: 'days',
  },
  {
    key: 'decayPerWeek', label: 'Decay Rate', group: 'Inactivity Decay',
    description: 'Points lost per week of inactivity (after grace period). At 1 point/week, it takes 25 weeks of total inactivity to drop from Cool AF to CHILL. Gentle but persistent.',
    min: 0.5, max: 5, step: 0.5, unit: 'pts/week',
  },
  {
    key: 'decayFloor', label: 'Decay Floor', group: 'Inactivity Decay',
    description: 'Score stops decaying at this level. Prevents punishing users who take a long break — they shouldn\'t drop to WEIRDO just for being inactive. Set to your CHILL threshold for a clean "unknown" baseline on return.',
    min: 25, max: 85, step: 5, unit: 'pts',
  },

  // Auto-moderation
  {
    key: 'weirdoAutoReviewCount', label: 'WEIRDO Auto-Review', group: 'Auto-Moderation',
    description: 'How many unique users must rate someone WEIRDO before their account is auto-suspended for admin review. At 3, it takes 3 separate people flagging safety concerns to trigger. Lower = more aggressive moderation.',
    min: 2, max: 10, step: 1, unit: 'ratings',
  },
  {
    key: 'retaliationWindowMinutes', label: 'Retaliation Window', group: 'Auto-Moderation',
    description: 'If two users rate each other WEIRDO or Kinda Creepy within this window (in minutes), both ratings are flagged as potential retaliation and neither counts until admin reviews. Prevents revenge-rating wars.',
    min: 2, max: 30, step: 1, unit: 'min',
  },
];

export default function ChillConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/admin/chill-config')
      .then(r => r.json())
      .then(data => { setConfig(data.config); setUpdatedAt(data.updatedAt); })
      .finally(() => setLoading(false));
  }, []);

  function updateField(key: keyof Config, value: number) {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);

    // Debounced auto-save
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch('/api/admin/chill-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      setSaving(false);
      setSaved('Saved');
      setUpdatedAt(new Date().toISOString());
      setTimeout(() => setSaved(''), 2000);
    }, 600);
  }

  if (loading || !config) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--admin-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #00E676', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // Group fields
  const groups = [...new Set(FIELDS.map(f => f.group))];

  // Live preview — simulate a rating at different ride counts
  const previewRides = [5, 25, 50, 100];

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--admin-bg)', color: 'var(--admin-text)',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      paddingTop: 56, paddingBottom: 80,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .cfg-slider { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 100px; background: #1f1f1f; outline: none; }
        .cfg-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #00E676; cursor: pointer; border: 2px solid #080808; box-shadow: 0 0 8px rgba(0,230,118,0.3); }
        .cfg-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #00E676; cursor: pointer; border: 2px solid #080808; }
        .tooltip-overlay { position: fixed; inset: 0; z-index: 99; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 32, lineHeight: 1,
          }}>
            Chill Score Config
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saving && <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #00E676', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />}
            {saved && <span style={{ fontSize: 12, color: '#00E676', fontWeight: 600 }}>{saved}</span>}
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 4 }}>
          Tune how chill scores are calculated. Changes take effect immediately for all users.
        </p>
        {updatedAt && (
          <p style={{ fontSize: 11, color: '#555', fontFamily: "var(--font-mono, monospace)" }}>
            Last updated: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Live Preview */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{
          background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
          borderRadius: 16, padding: '16px',
        }}>
          <div style={{ fontSize: 11, color: '#888', fontFamily: "var(--font-mono, monospace)", letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            Live Preview — Score Impact Per Rating
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600 }}>Rides</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#00E676' }}>Cool AF</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#00E676' }}>CHILL</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#FF9100' }}>Creepy</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#FF5252' }}>WEIRDO</th>
                </tr>
              </thead>
              <tbody>
                {previewRides.map(rides => {
                  const w = Math.max(config.minWeight, config.baseWeight / Math.sqrt(rides));
                  return (
                    <tr key={rides} style={{ borderTop: '1px solid var(--admin-border)' }}>
                      <td style={{ padding: '8px', color: '#bbb', fontFamily: "var(--font-mono, monospace)" }}>{rides}</td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#00E676', fontFamily: "var(--font-mono, monospace)" }}>+{(w * config.coolAfMultiplier).toFixed(1)}</td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#00E676', fontFamily: "var(--font-mono, monospace)" }}>+{(w * config.chillMultiplier).toFixed(1)}</td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#FF9100', fontFamily: "var(--font-mono, monospace)" }}>-{(w * config.creepyMultiplier).toFixed(1)}</td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#FF5252', fontFamily: "var(--font-mono, monospace)" }}>-{(w * config.weirdoMultiplier).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tier Preview */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          {[
            { label: `Cool AF 😎 ${config.coolAfMin}+`, color: '#00E676' },
            { label: `CHILL ✅ ${config.chillMin}–${config.coolAfMin - 1}`, color: '#00E676' },
            { label: `Aight 🤷 ${config.aightMin}–${config.chillMin - 1}`, color: '#FFD600' },
            { label: `Sketchy 👀 ${config.sketchyMin}–${config.aightMin - 1}`, color: '#FF9100' },
            { label: `WEIRDO 🚩 0–${config.sketchyMin - 1}`, color: '#FF5252' },
          ].map(t => (
            <span key={t.label} style={{
              padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
              background: t.color + '15', color: t.color, border: `1px solid ${t.color}30`,
              whiteSpace: 'nowrap',
            }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Config Fields */}
      {groups.map(group => (
        <div key={group} style={{ padding: '0 20px', marginBottom: 20 }}>
          <div style={{
            fontSize: 10, color: '#888', fontFamily: "var(--font-mono, monospace)",
            letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12,
            paddingBottom: 8, borderBottom: '1px solid var(--admin-border)',
          }}>
            {group}
          </div>

          {FIELDS.filter(f => f.group === group).map(field => (
            <div key={field.key} style={{ marginBottom: 20 }}>
              {/* Label row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>{field.label}</span>
                  {/* Info button */}
                  <button
                    onClick={() => setOpenTooltip(openTooltip === field.key ? null : field.key)}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)',
                      background: openTooltip === field.key ? 'rgba(0,230,118,0.15)' : 'transparent',
                      color: openTooltip === field.key ? '#00E676' : '#888',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1, padding: 0, flexShrink: 0,
                    }}
                  >
                    ?
                  </button>
                </div>
                <span style={{
                  fontSize: 16, fontWeight: 700, color: '#00E676',
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  minWidth: 50, textAlign: 'right',
                }}>
                  {config[field.key]}{field.unit}
                </span>
              </div>

              {/* Tooltip/description — expandable */}
              {openTooltip === field.key && (
                <>
                  <div className="tooltip-overlay" onClick={() => setOpenTooltip(null)} />
                  <div style={{
                    position: 'relative', zIndex: 100,
                    background: 'var(--admin-bg)', border: '1px solid rgba(0,230,118,0.2)',
                    borderRadius: 12, padding: '12px 14px', marginBottom: 10,
                    fontSize: 13, color: '#bbb', lineHeight: 1.6,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                  }}>
                    {field.description}
                  </div>
                </>
              )}

              {/* Slider */}
              <input
                type="range"
                className="cfg-slider"
                min={field.min}
                max={field.max}
                step={field.step}
                value={config[field.key]}
                onChange={(e) => updateField(field.key, parseFloat(e.target.value))}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginTop: 4 }}>
                <span>{field.min}{field.unit}</span>
                <span>{field.max}{field.unit}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
