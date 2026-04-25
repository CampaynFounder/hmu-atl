'use client';

import { useState } from 'react';

// Curated list of common ATL vehicles. Each make has 5-8 popular models.
// "Other" lets the driver type free text — falls back to original input UX.
const MAKES: Array<{ name: string; models: string[] }> = [
  { name: 'Toyota', models: ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Sienna', 'Tacoma'] },
  { name: 'Honda', models: ['Accord', 'Civic', 'CR-V', 'Pilot', 'Odyssey', 'HR-V'] },
  { name: 'Nissan', models: ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Maxima', 'Murano'] },
  { name: 'Hyundai', models: ['Sonata', 'Elantra', 'Tucson', 'Santa Fe', 'Palisade'] },
  { name: 'Kia', models: ['Optima', 'Forte', 'Sorento', 'Telluride', 'Soul', 'K5'] },
  { name: 'Chevy', models: ['Malibu', 'Impala', 'Equinox', 'Tahoe', 'Suburban', 'Traverse'] },
  { name: 'Ford', models: ['Fusion', 'Escape', 'Explorer', 'Expedition', 'F-150'] },
  { name: 'Tesla', models: ['Model 3', 'Model Y', 'Model S', 'Model X'] },
  { name: 'Dodge', models: ['Charger', 'Challenger', 'Durango', 'Grand Caravan'] },
  { name: 'Jeep', models: ['Grand Cherokee', 'Cherokee', 'Wrangler', 'Compass'] },
  { name: 'BMW', models: ['3 Series', '5 Series', 'X3', 'X5'] },
  { name: 'Mercedes', models: ['C-Class', 'E-Class', 'GLE', 'GLC'] },
  { name: 'Lexus', models: ['ES', 'RX', 'NX', 'GX'] },
];

const OTHER = 'Other';

interface Props {
  make: string;
  model: string;
  year: string;
  yearVisibility: 'required' | 'optional' | 'hidden';
  // 1-based passenger seat indices the driver allows (excludes driver seat).
  // Layout indices: 1=front-passenger, 2=rear-left, 3=rear-mid, 4=rear-right,
  // 5=row3-left, 6=row3-right.
  allowedSeats: number[];
  thirdRow: boolean;
  onChange: (updates: Partial<{
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: string;
    allowedSeats: number[];
    thirdRow: boolean;
    maxAdults: number;
  }>) => void;
}

export function ExpressVehiclePicker({ make, model, year, yearVisibility, allowedSeats, thirdRow, onChange }: Props) {
  const [otherMakeText, setOtherMakeText] = useState('');
  const [otherModelText, setOtherModelText] = useState('');

  const knownMake = MAKES.find(m => m.name.toLowerCase() === make.toLowerCase());
  const isOtherMake = !knownMake && make.length > 0;
  const showOtherMakeInput = make === OTHER || isOtherMake;
  const models = knownMake?.models ?? [];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => String(currentYear - i));

  function toggleSeat(idx: number) {
    const has = allowedSeats.includes(idx);
    const next = has ? allowedSeats.filter(s => s !== idx) : [...allowedSeats, idx];
    onChange({ allowedSeats: next, maxAdults: next.length });
  }

  function setMake(m: string) {
    if (m === OTHER) {
      onChange({ vehicleMake: OTHER, vehicleModel: '' });
      setOtherMakeText('');
      return;
    }
    onChange({ vehicleMake: m, vehicleModel: '' });
  }

  function setModel(mod: string) {
    if (mod === OTHER) {
      onChange({ vehicleModel: OTHER });
      setOtherModelText('');
      return;
    }
    onChange({ vehicleModel: mod });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Make pills */}
      <div>
        <div style={labelStyle}>Make</div>
        <div style={pillRowStyle}>
          {MAKES.map(m => (
            <Pill key={m.name} active={knownMake?.name === m.name} onClick={() => setMake(m.name)}>
              {m.name}
            </Pill>
          ))}
          <Pill active={make === OTHER || isOtherMake} onClick={() => setMake(OTHER)}>
            {OTHER}
          </Pill>
        </div>
        {showOtherMakeInput && (
          <input
            type="text"
            placeholder="Type your make"
            value={make === OTHER ? otherMakeText : make}
            onChange={(e) => {
              setOtherMakeText(e.target.value);
              onChange({ vehicleMake: e.target.value || OTHER });
            }}
            style={{ ...inputStyle, marginTop: 10 }}
          />
        )}
      </div>

      {/* Model pills (when known make selected) */}
      {knownMake && (
        <div>
          <div style={labelStyle}>Model</div>
          <div style={pillRowStyle}>
            {models.map(mo => (
              <Pill key={mo} active={model === mo} onClick={() => setModel(mo)}>
                {mo}
              </Pill>
            ))}
            <Pill active={model === OTHER} onClick={() => setModel(OTHER)}>
              {OTHER}
            </Pill>
          </div>
          {model === OTHER && (
            <input
              type="text"
              placeholder="Type your model"
              value={otherModelText}
              onChange={(e) => {
                setOtherModelText(e.target.value);
                onChange({ vehicleModel: e.target.value || OTHER });
              }}
              style={{ ...inputStyle, marginTop: 10 }}
            />
          )}
        </div>
      )}

      {/* "Other" make → free model */}
      {showOtherMakeInput && !knownMake && (
        <div>
          <div style={labelStyle}>Model</div>
          <input
            type="text"
            placeholder="e.g. Accord, Camry"
            value={model}
            onChange={(e) => onChange({ vehicleModel: e.target.value })}
            style={inputStyle}
          />
        </div>
      )}

      {/* Year */}
      {yearVisibility !== 'hidden' && (
        <div>
          <div style={labelStyle}>
            Year {yearVisibility === 'optional' && <span style={{ color: '#666', fontWeight: 400 }}>(optional)</span>}
          </div>
          <select
            value={year}
            onChange={(e) => onChange({ vehicleYear: e.target.value })}
            style={{ ...inputStyle, appearance: 'none' }}
          >
            <option value="">Select year</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {/* Seat map */}
      <div>
        <div style={labelStyle}>Allowed seats</div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          Tap a seat to allow riders there. The driver seat is always you.
        </p>
        <SeatMap allowedSeats={allowedSeats} thirdRow={thirdRow} onToggle={toggleSeat} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#bbb' }}>
          <input
            type="checkbox"
            checked={thirdRow}
            onChange={(e) => {
              const next = e.target.checked;
              // If turning off, drop seats 5/6.
              const filtered = next ? allowedSeats : allowedSeats.filter(s => s < 5);
              onChange({ thirdRow: next, allowedSeats: filtered, maxAdults: filtered.length });
            }}
          />
          Third row (SUV / minivan)
        </label>
        <div style={{ marginTop: 10, fontSize: 12, color: '#00E676', fontWeight: 600 }}>
          Max riders: {allowedSeats.length}
        </div>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 999,
        border: active ? '1px solid #00E676' : '1px solid rgba(255,255,255,0.12)',
        background: active ? 'rgba(0,230,118,0.15)' : '#1a1a1a',
        color: active ? '#00E676' : '#ddd',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

interface SeatMapProps {
  allowedSeats: number[];
  thirdRow: boolean;
  onToggle: (idx: number) => void;
}

function SeatMap({ allowedSeats, thirdRow, onToggle }: SeatMapProps) {
  const has = (i: number) => allowedSeats.includes(i);
  const seatStyle = (active: boolean): React.CSSProperties => ({
    width: 56,
    height: 64,
    borderRadius: 12,
    border: active ? '2px solid #00E676' : '2px solid rgba(255,255,255,0.12)',
    background: active ? 'rgba(0,230,118,0.18)' : '#1a1a1a',
    color: active ? '#00E676' : '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 22,
    fontWeight: 700,
    transition: 'all 0.15s ease',
  });
  const driverStyle: React.CSSProperties = {
    ...seatStyle(false),
    cursor: 'default',
    border: '2px dashed rgba(0,230,118,0.3)',
    background: 'rgba(0,230,118,0.05)',
    color: '#00E676',
  };

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #0f0f0f 0%, #161616 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      {/* Steering wheel cue */}
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Front</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={driverStyle} title="Driver">🧑‍✈️</div>
        <button type="button" onClick={() => onToggle(1)} style={seatStyle(has(1))}>
          {has(1) ? '✓' : '+'}
        </button>
      </div>

      {/* Row 2 — three across */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" onClick={() => onToggle(2)} style={seatStyle(has(2))}>{has(2) ? '✓' : '+'}</button>
        <button type="button" onClick={() => onToggle(3)} style={seatStyle(has(3))}>{has(3) ? '✓' : '+'}</button>
        <button type="button" onClick={() => onToggle(4)} style={seatStyle(has(4))}>{has(4) ? '✓' : '+'}</button>
      </div>

      {/* Optional third row */}
      {thirdRow && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => onToggle(5)} style={seatStyle(has(5))}>{has(5) ? '✓' : '+'}</button>
          <button type="button" onClick={() => onToggle(6)} style={seatStyle(has(6))}>{has(6) ? '✓' : '+'}</button>
        </div>
      )}

      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Rear</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#888',
  marginBottom: 8,
  fontWeight: 600,
  display: 'block',
};

const pillRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  padding: '14px 16px',
  color: '#fff',
  fontSize: 16,
  outline: 'none',
  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};
