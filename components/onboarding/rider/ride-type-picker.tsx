'use client';

// Multi-select pill picker for rider ride types ("work", "errands", …).
// Options come from platform_config['onboarding.rider_profile_fields'] — the
// admin can add/remove/reorder/disable without a deploy. Visual language
// matches the driver MarketAreaPicker so onboarding feels consistent.

import type { RideTypeOption } from '@/lib/onboarding/rider-profile-fields-config';

interface Props {
  options: RideTypeOption[];        // already filtered to enabled options
  selectedSlugs: string[];
  maxSelections: number;
  onChange: (selectedSlugs: string[]) => void;
}

export function RideTypePicker({ options, selectedSlugs, maxSelections, onChange }: Props) {
  const toggle = (slug: string) => {
    const has = selectedSlugs.includes(slug);
    if (has) {
      onChange(selectedSlugs.filter(s => s !== slug));
      return;
    }
    if (selectedSlugs.length >= maxSelections) return;
    onChange([...selectedSlugs, slug]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => {
          const selected = selectedSlugs.includes(opt.slug);
          const disabled = !selected && selectedSlugs.length >= maxSelections;
          return (
            <button
              key={opt.slug}
              type="button"
              onClick={() => toggle(opt.slug)}
              disabled={disabled}
              style={{
                background: selected ? 'rgba(0,230,118,0.12)' : '#1f1f1f',
                border: `1px solid ${selected ? 'rgba(0,230,118,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 100,
                padding: '10px 16px',
                fontSize: 14,
                color: selected ? '#00E676' : disabled ? '#555' : '#bbb',
                fontWeight: selected ? 700 : 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {opt.emoji && <span style={{ fontSize: 16 }}>{opt.emoji}</span>}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: '#666' }}>
        {selectedSlugs.length === 0
          ? `Pick up to ${maxSelections}.`
          : `${selectedSlugs.length} of ${maxSelections} selected${selectedSlugs.length >= maxSelections ? ' — max' : ''}`}
      </div>
    </div>
  );
}
