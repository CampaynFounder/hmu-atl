'use client';

import type { PricingTier } from '@/lib/onboarding/config';

interface Props {
  tiers: PricingTier[];
  selectedMin: number;
  stopsFee: number;
  waitPerMin: number;
  onChange: (tier: PricingTier) => void;
}

export function ExpressPricingPill({ tiers, selectedMin, stopsFee, waitPerMin, onChange }: Props) {
  const selected = tiers.find(t => t.min === selectedMin) ?? tiers.find(t => t.default) ?? tiers[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 10, fontWeight: 600 }}>
          Pick a starting minimum
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {tiers.map(t => {
            const active = t.min === selected.min;
            return (
              <button
                key={t.min}
                type="button"
                onClick={() => onChange(t)}
                style={{
                  flex: 1,
                  padding: '18px 12px',
                  borderRadius: 16,
                  border: active ? '2px solid #00E676' : '2px solid rgba(255,255,255,0.08)',
                  background: active ? 'rgba(0,230,118,0.12)' : '#141414',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: 26, fontWeight: 800, color: active ? '#00E676' : '#fff' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Min ride
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Your auto-set rates
        </div>
        <Row label="30 min" value={`$${selected.rate30}`} />
        <Row label="1 hour" value={`$${selected.rate1h}`} />
        <Row label="2 hours" value={`$${selected.rate2h}`} />
        <Row label="Extra stop" value={`$${stopsFee}`} />
        <Row label="Waiting" value={`$${waitPerMin}/min`} last />
        <div style={{ fontSize: 11, color: '#888', marginTop: 10 }}>
          You can fine-tune any of these from your profile after you&apos;re live.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span style={{ fontSize: 13, color: '#bbb' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
        {value}
      </span>
    </div>
  );
}
