'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { FunnelStageRow } from '@/lib/cms/types';

export default function StagesPage() {
  const [stages, setStages] = useState<FunnelStageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSlug, setNewSlug] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#448AFF');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchStages = useCallback(() => {
    fetch('/api/admin/funnel/stages')
      .then((r) => r.json())
      .then((data) => setStages(data.stages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  const createStage = async () => {
    if (!newSlug || !newLabel) return;
    setCreating(true);
    await fetch('/api/admin/funnel/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: newSlug, label: newLabel, color: newColor, description: newDesc || null }),
    });
    setNewSlug('');
    setNewLabel('');
    setNewColor('#448AFF');
    setNewDesc('');
    setCreating(false);
    fetchStages();
  };

  const deleteStage = async (id: string) => {
    if (!confirm('Delete this funnel stage?')) return;
    await fetch('/api/admin/funnel/stages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchStages();
  };

  return (
    <div style={{ padding: '24px', maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/funnel" style={{ color: 'var(--admin-text-muted)', textDecoration: 'none', fontSize: 14 }}>
          &larr; Funnel CMS
        </Link>
        <span style={{ color: 'var(--admin-text-faint)' }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--admin-text)' }}>Funnel Stages</h1>
      </div>

      {/* Create new stage */}
      <div style={{
        padding: 20, borderRadius: 12, marginBottom: 24,
        background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 12 }}>
          Create Stage
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="slug (e.g. retention)"
            style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)',
            }}
          />
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (e.g. Retention)"
            style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)',
            }}
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid var(--admin-border)', cursor: 'pointer' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)',
            }}
          />
          <button
            onClick={createStage}
            disabled={creating || !newSlug || !newLabel}
            style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: '#00E676', color: '#000', border: 'none', cursor: 'pointer',
              opacity: creating || !newSlug || !newLabel ? 0.5 : 1,
            }}
          >
            Create
          </button>
        </div>
      </div>

      {/* Stage list */}
      {loading ? (
        <div style={{ color: 'var(--admin-text-muted)', padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {stages.map((stage) => (
            <div
              key={stage.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px', borderRadius: 10,
                background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: stage.color }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>
                    {stage.label}
                    {stage.is_default && (
                      <span style={{
                        fontSize: 9, marginLeft: 8, padding: '2px 6px', borderRadius: 3,
                        background: 'rgba(0,230,118,0.1)', color: '#00E676', fontWeight: 700,
                      }}>
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 2 }}>
                    {stage.slug} {stage.description && `— ${stage.description}`}
                  </div>
                </div>
              </div>
              {!stage.is_default && (
                <button
                  onClick={() => deleteStage(stage.id)}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 11,
                    background: 'transparent', color: '#FF5252',
                    border: '1px solid rgba(255,82,82,0.2)', cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
