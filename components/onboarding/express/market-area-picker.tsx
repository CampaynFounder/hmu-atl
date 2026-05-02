'use client';

// Multi-select area picker for express driver onboarding.
// Mirrors the chip layout from /driver/profile so drivers see the same vocab
// in onboarding and post-signup. Areas are grouped by cardinal direction with
// an "Anywhere in {market}" toggle on top — when on, area chips are hidden
// and we save services_entire_market = true with empty area_slugs.

import type { MarketAreaChip, Cardinal } from './market-area-picker.types';

interface Props {
  marketName: string;
  areas: MarketAreaChip[];
  selectedSlugs: string[];
  servicesEntireMarket: boolean;
  acceptsLongDistance: boolean;
  onChange: (patch: {
    selectedSlugs?: string[];
    servicesEntireMarket?: boolean;
    acceptsLongDistance?: boolean;
  }) => void;
}

const CARDINAL_ORDER: Cardinal[] = ['central', 'northside', 'eastside', 'southside', 'westside'];
const CARDINAL_LABEL: Record<Cardinal, string> = {
  central: 'Central',
  northside: 'Northside',
  eastside: 'Eastside',
  southside: 'Southside',
  westside: 'Westside',
};

export function MarketAreaPicker({
  marketName,
  areas,
  selectedSlugs,
  servicesEntireMarket,
  acceptsLongDistance,
  onChange,
}: Props) {
  const toggleSlug = (slug: string) => {
    const next = selectedSlugs.includes(slug)
      ? selectedSlugs.filter(s => s !== slug)
      : [...selectedSlugs, slug];
    onChange({ selectedSlugs: next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderRadius: 12,
            background: servicesEntireMarket ? 'rgba(0,230,118,0.08)' : '#1f1f1f',
            border: `1px solid ${servicesEntireMarket ? 'rgba(0,230,118,0.3)' : 'rgba(255,255,255,0.08)'}`,
            cursor: 'pointer',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>
              Anywhere in {marketName}
            </div>
            <div style={{ color: '#8a8a8a', fontSize: 13, marginTop: 2 }}>
              Show me every request — no area filter
            </div>
          </div>
          <input
            type="checkbox"
            checked={servicesEntireMarket}
            onChange={e => onChange({ servicesEntireMarket: e.target.checked })}
            style={{ width: 20, height: 20, accentColor: '#00E676', cursor: 'pointer' }}
          />
        </label>

        <label
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderRadius: 12,
            background: acceptsLongDistance ? 'rgba(0,230,118,0.08)' : '#1f1f1f',
            border: `1px solid ${acceptsLongDistance ? 'rgba(0,230,118,0.3)' : 'rgba(255,255,255,0.08)'}`,
            cursor: 'pointer',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Long distance OK</div>
            <div style={{ color: '#8a8a8a', fontSize: 13, marginTop: 2 }}>
              Accept rides where the dropoff is outside {marketName}
            </div>
          </div>
          <input
            type="checkbox"
            checked={acceptsLongDistance}
            onChange={e => onChange({ acceptsLongDistance: e.target.checked })}
            style={{ width: 20, height: 20, accentColor: '#00E676', cursor: 'pointer' }}
          />
        </label>
      </div>

      {!servicesEntireMarket && (
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
                    const selected = selectedSlugs.includes(a.slug);
                    return (
                      <button
                        key={a.slug}
                        type="button"
                        onClick={() => toggleSlug(a.slug)}
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
      )}

      {!servicesEntireMarket && selectedSlugs.length === 0 && (
        <div style={{ fontSize: 12, color: '#888', textAlign: 'center', marginTop: 4 }}>
          Pick at least one area, or flip on &ldquo;Anywhere in {marketName}&rdquo; above.
        </div>
      )}
    </div>
  );
}
