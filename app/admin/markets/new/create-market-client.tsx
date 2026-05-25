'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Cardinal = 'westside' | 'eastside' | 'northside' | 'southside' | 'central';

interface AreaRow {
  id: string;
  name: string;
  cardinal: Cardinal;
}

const CARDINALS: Cardinal[] = ['central', 'eastside', 'westside', 'northside', 'southside'];

const US_TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)' },
  { value: 'America/Chicago',     label: 'Central (CT)' },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix',     label: 'Arizona (no DST)' },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HST)' },
];

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function areaSlug(name: string, index: number, existing: string[]): string {
  const base = toSlug(name) || `area-${index + 1}`;
  if (!existing.includes(base)) return base;
  return `${base}-${index + 1}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

export default function CreateMarketClient() {
  const router = useRouter();

  const [name, setName]           = useState('');
  const [slug, setSlug]           = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [state, setState]         = useState('');
  const [timezone, setTimezone]   = useState('America/New_York');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('30');
  const [smsDid, setSmsDid]       = useState('');
  const [smsAreaCode, setSmsAreaCode] = useState('');
  const [tagline, setTagline]     = useState('');
  const [areas, setAreas]         = useState<AreaRow[]>([
    { id: uid(), name: '', cardinal: 'central' },
    { id: uid(), name: '', cardinal: 'eastside' },
    { id: uid(), name: '', cardinal: 'westside' },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleNameChange = useCallback((val: string) => {
    setName(val);
    if (!slugManual) setSlug(toSlug(val));
  }, [slugManual]);

  const handleSlugChange = useCallback((val: string) => {
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    setSlugManual(true);
  }, []);

  const addArea = () => setAreas(prev => [...prev, { id: uid(), name: '', cardinal: 'central' }]);

  const removeArea = (id: string) => setAreas(prev => prev.filter(a => a.id !== id));

  const updateArea = (id: string, field: 'name' | 'cardinal', value: string) => {
    setAreas(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validAreas = areas.filter(a => a.name.trim());
    if (validAreas.length === 0) {
      setError('Add at least one neighborhood name.');
      return;
    }

    const usedSlugs: string[] = [];
    const mappedAreas = validAreas.map((a, i) => {
      const s = areaSlug(a.name, i, usedSlugs);
      usedSlugs.push(s);
      return { slug: s, name: a.name.trim(), cardinal: a.cardinal, sort_order: i + 1 };
    });

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: name.trim(),
          state: state.trim().toUpperCase(),
          timezone,
          centerLat: parseFloat(centerLat),
          centerLng: parseFloat(centerLng),
          radiusMiles: parseFloat(radiusMiles),
          smsDid: smsDid.trim() || null,
          smsAreaCode: smsAreaCode.trim() || null,
          areas: mappedAreas,
          branding: tagline.trim() ? { tagline: tagline.trim() } : {},
          cloneCmsFrom: 'atl',
        }),
      });

      const data = await res.json().catch(() => ({})) as { error?: string; market?: { slug: string } };

      if (!res.ok) {
        setError(data.error || 'Failed to create market');
        return;
      }

      router.push(`/admin/markets?created=${data.market?.slug ?? slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 680, color: 'var(--admin-text)' }}>
      <div style={{ marginBottom: 28 }}>
        <a
          href="/admin/markets"
          style={{ fontSize: 12, color: 'var(--admin-text-dim)', textDecoration: 'none', letterSpacing: 0.3 }}
        >
          ← Markets
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>Add New Market</h1>
        <p style={{ fontSize: 13, color: 'var(--admin-text-dim)', margin: 0 }}>
          Creates the market in the DB at <strong>setup</strong> status. Flip to <strong>live</strong> from the Markets table when ready.
        </p>
      </div>

      <form onSubmit={handleSubmit}>

        {/* BASIC INFO */}
        <Section title="Basic Info">
          <Field label="City name" required>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Charlotte"
              required
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Slug" required hint="auto-derived · edit to override">
              <input
                value={slug}
                onChange={e => handleSlugChange(e.target.value)}
                placeholder="charlotte"
                pattern="^[a-z0-9-]+$"
                required
                style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: 0.5 }}
              />
            </Field>
            <Field label="State" required>
              <input
                value={state}
                onChange={e => setState(e.target.value)}
                placeholder="NC"
                maxLength={2}
                required
                style={{ ...inputStyle, textTransform: 'uppercase' }}
              />
            </Field>
          </div>

          <Field label="Timezone" required>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              style={selectStyle}
            >
              {US_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
        </Section>

        {/* GEOGRAPHY */}
        <Section title="Geography">
          <p style={{ fontSize: 12, color: 'var(--admin-text-dim)', marginTop: 0, marginBottom: 12 }}>
            Center point for market detection. Riders/drivers within radius_miles are in-market.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Center latitude" required>
              <input
                type="number"
                value={centerLat}
                onChange={e => setCenterLat(e.target.value)}
                placeholder="35.2271"
                step="any"
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Center longitude" required>
              <input
                type="number"
                value={centerLng}
                onChange={e => setCenterLng(e.target.value)}
                placeholder="-80.8431"
                step="any"
                required
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Radius (miles)" required>
            <input
              type="number"
              value={radiusMiles}
              onChange={e => setRadiusMiles(e.target.value)}
              placeholder="30"
              min={5}
              max={500}
              required
              style={{ ...inputStyle, maxWidth: 120 }}
            />
          </Field>
        </Section>

        {/* NEIGHBORHOODS */}
        <Section title="Neighborhoods">
          <p style={{ fontSize: 12, color: 'var(--admin-text-dim)', marginTop: 0, marginBottom: 12 }}>
            These appear as the areas drivers and riders pick from. Add 8–12. The 5 cardinal macros (Central, Eastside, …) are added automatically.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {areas.map((area, i) => (
              <div key={area.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={area.name}
                  onChange={e => updateArea(area.id, 'name', e.target.value)}
                  placeholder={`Neighborhood ${i + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <select
                  value={area.cardinal}
                  onChange={e => updateArea(area.id, 'cardinal', e.target.value as Cardinal)}
                  style={{ ...selectStyle, width: 130, flexShrink: 0 }}
                >
                  {CARDINALS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {areas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeArea(area.id)}
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--admin-text-dim)', cursor: 'pointer',
                      fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addArea}
            style={{
              marginTop: 10, background: 'none',
              border: '1px dashed var(--admin-border)', borderRadius: 6,
              color: 'var(--admin-text-dim)', cursor: 'pointer',
              fontSize: 12, padding: '7px 14px', width: '100%',
            }}
          >
            + Add neighborhood
          </button>
        </Section>

        {/* SMS */}
        <Section title="SMS (optional)">
          <p style={{ fontSize: 12, color: 'var(--admin-text-dim)', marginTop: 0, marginBottom: 12 }}>
            Leave blank to reuse the ATL DID during pilot. Swap to a local number later in market settings.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <Field label="VoIP.ms DID (10-digit)">
              <input
                value={smsDid}
                onChange={e => setSmsDid(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="4049137292"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
            </Field>
            <Field label="Area code">
              <input
                value={smsAreaCode}
                onChange={e => setSmsAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="704"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
            </Field>
          </div>
        </Section>

        {/* BRANDING */}
        <Section title="Branding (optional)">
          <Field label="Tagline" hint="falls back to ATL default if blank">
            <input
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="Make Bank Trips not Blank Trips"
              style={inputStyle}
            />
          </Field>
        </Section>

        {error && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 6,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '11px 28px', borderRadius: 8, border: 'none',
              background: submitting ? 'var(--admin-border)' : '#00E676',
              color: submitting ? 'var(--admin-text-dim)' : '#080808',
              fontWeight: 700, fontSize: 14, cursor: submitting ? 'default' : 'pointer',
              letterSpacing: 0.3,
            }}
          >
            {submitting ? 'Creating…' : 'Create Market'}
          </button>
          <a
            href="/admin/markets"
            style={{ fontSize: 13, color: 'var(--admin-text-dim)', textDecoration: 'none' }}
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 28, padding: 20, borderRadius: 8,
      border: '1px solid var(--admin-border)',
      background: 'var(--admin-bg-elevated)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        textTransform: 'uppercase', color: 'var(--admin-text-dim)',
        marginBottom: 16,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 600, marginBottom: 6,
        color: 'var(--admin-text)',
      }}>
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
        {hint && <span style={{ fontWeight: 400, color: 'var(--admin-text-dim)', marginLeft: 6 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--admin-bg)',
  border: '1px solid var(--admin-border)',
  borderRadius: 6,
  color: 'var(--admin-text)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--admin-bg)',
  border: '1px solid var(--admin-border)',
  borderRadius: 6,
  color: 'var(--admin-text)',
  fontSize: 14,
  cursor: 'pointer',
  boxSizing: 'border-box',
};
