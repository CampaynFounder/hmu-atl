'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useMarket } from '@/app/admin/components/market-context';

interface Persona {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  audience: string;
  color: string;
  is_active: boolean;
  market_slug: string;
}

export default function PersonasPage() {
  const { selectedMarketId } = useMarket();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSlug, setNewSlug] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAudience, setNewAudience] = useState('driver');
  const [newColor, setNewColor] = useState('#448AFF');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchPersonas = useCallback(() => {
    const qs = selectedMarketId ? `?market_id=${selectedMarketId}` : '';
    fetch(`/api/admin/funnel/personas${qs}`)
      .then((r) => r.json())
      .then((data) => setPersonas(data.personas || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedMarketId]);

  useEffect(() => { fetchPersonas(); }, [fetchPersonas]);

  const createPersona = async () => {
    if (!newSlug || !newLabel || !selectedMarketId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/funnel/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug, label: newLabel, description: newDesc || null, audience: newAudience, market_id: selectedMarketId, color: newColor }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error || res.statusText}`);
        return;
      }
      setNewSlug(''); setNewLabel(''); setNewDesc(''); setNewColor('#448AFF'); setShowCreate(false);
      fetchPersonas();
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch('/api/admin/funnel/personas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    fetchPersonas();
  };

  const deletePersona = async (id: string) => {
    if (!confirm('Delete this persona? Content variants targeting it will fall back to default.')) return;
    await fetch('/api/admin/funnel/personas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchPersonas();
  };

  const driverPersonas = personas.filter((p) => p.audience === 'driver' || p.audience === 'all');
  const riderPersonas = personas.filter((p) => p.audience === 'rider' || p.audience === 'all');

  return (
    <div style={{ padding: '24px', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link href="/admin/funnel" style={{ color: 'var(--admin-text-muted)', textDecoration: 'none', fontSize: 14 }}>
          &larr; Funnel CMS
        </Link>
        <span style={{ color: 'var(--admin-text-faint)' }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--admin-text)' }}>Personas</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            marginLeft: 'auto', padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: '#00E676', color: '#000', border: 'none', cursor: 'pointer',
          }}
        >
          {showCreate ? 'Cancel' : '+ New Persona'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginBottom: 20 }}>
        Personas let you speak to different audience segments with tailored content. Use <code style={{ background: 'var(--admin-bg-active)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>?utm_persona=slug</code> in ad URLs to target specific personas.
      </p>

      {/* Create form */}
      {showCreate && (
        <div style={{
          padding: 20, borderRadius: 12, marginBottom: 20,
          background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 12 }}>Create Persona</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="slug (e.g. rideshare_escape)" style={inputStyle} />
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Rideshare Refugees)" style={inputStyle} />
          </div>
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description — who is this persona?" style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select value={newAudience} onChange={(e) => setNewAudience(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="driver">Driver persona</option>
              <option value="rider">Rider persona</option>
              <option value="all">Both (driver + rider)</option>
            </select>
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
              style={{ width: 48, height: 38, borderRadius: 6, border: '1px solid var(--admin-border)', cursor: 'pointer' }} />
          </div>
          <button onClick={createPersona} disabled={creating || !newSlug || !newLabel}
            style={{ ...primaryBtnStyle, opacity: creating || !newSlug || !newLabel ? 0.5 : 1 }}>
            {creating ? 'Creating...' : 'Create Persona'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-muted)' }}>Loading...</div>
      ) : (
        <>
          {/* Driver Personas */}
          {driverPersonas.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-faint)', marginBottom: 8, textTransform: 'uppercase' }}>
                Driver Personas
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {driverPersonas.map((p) => (
                  <PersonaCard key={p.id} persona={p} onToggle={toggleActive} onDelete={deletePersona} />
                ))}
              </div>
            </div>
          )}

          {/* Rider Personas */}
          {riderPersonas.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-faint)', marginBottom: 8, textTransform: 'uppercase' }}>
                Rider Personas
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {riderPersonas.map((p) => (
                  <PersonaCard key={p.id} persona={p} onToggle={toggleActive} onDelete={deletePersona} />
                ))}
              </div>
            </div>
          )}

          {personas.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-muted)', background: 'var(--admin-bg-elevated)', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
              No personas created yet. Click &quot;+ New Persona&quot; to get started.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PersonaCard({ persona, onToggle, onDelete }: { persona: Persona; onToggle: (id: string, active: boolean) => void; onDelete: (id: string) => void }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 18px', borderRadius: 10,
      background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
      opacity: persona.is_active ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: persona.color, flexShrink: 0 }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>{persona.label}</span>
            <code style={{ fontSize: 10, color: 'var(--admin-text-faint)', background: 'var(--admin-bg-active)', padding: '1px 6px', borderRadius: 3 }}>
              {persona.slug}
            </code>
          </div>
          {persona.description && (
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 2 }}>{persona.description}</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--admin-text-faint)', marginTop: 2 }}>
            UTM: <code>?utm_persona={persona.slug}</code>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onToggle(persona.id, persona.is_active)}
          style={{
            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
            background: persona.is_active ? '#00E676' : 'rgba(255,255,255,0.1)',
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3, left: persona.is_active ? 21 : 3, transition: 'left 0.2s',
          }} />
        </button>
        <button onClick={() => onDelete(persona.id)}
          style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, background: 'transparent', color: '#FF5252', border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer' }}>
          Delete
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' };
const primaryBtnStyle: React.CSSProperties = { padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#00E676', color: '#000', border: 'none', cursor: 'pointer' };
