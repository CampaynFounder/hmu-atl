'use client';

// Single-select home-area picker for rider onboarding. Reuses the
// cardinal-grouped layout from the driver MarketAreaPicker but with
// radio-style "pick exactly one" semantics.

import type { MarketAreaChip, Cardinal } from '@/components/onboarding/express/market-area-picker.types';

interface Props {
  marketName: string;
  areas: MarketAreaChip[];
  selectedSlug: string | null;
  onChange: (slug: string | null) => void;
}

const CARDINAL_ORDER: Cardinal[] = ['central', 'northside', 'eastside', 'southside', 'westside'];
const CARDINAL_LABEL: Record<Cardinal, string> = {
  central: 'Central',
  northside: 'Northside',
  eastside: 'Eastside',
  southside: 'Southside',
  westside: 'Westside',
};

export function HomeAreaPicker({ marketName, areas, selectedSlug, onChange }: Props) {
  if (areas.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 12 }}>
        {marketName} doesn&apos;t have neighborhood areas configured yet — skip for now.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {CARDINAL_ORDER.map(cardinal => {
        const rows = areas.filter(a => a.cardinal === cardinal);
        if (!rows.length) return null;
        return (
          <div key={cardinal}>
            <div
              style={{
                fontSize: 10, letterSpacing: 2, color: '#666',
                textTransform: 'uppercase', marginBottom: 8,
              }}
            >
              {CARDINAL_LABEL[cardinal]}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rows.map(a => {
                const selected = selectedSlug === a.slug;
                return (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => onChange(selected ? null : a.slug)}
                    style={{
                      background: selected ? 'rgba(0,230,118,0.12)' : '#1f1f1f',
                      border: `1px solid ${selected ? 'rgba(0,230,118,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 13,
                      color: selected ? '#00E676' : '#bbb',
                      fontWeight: selected ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
