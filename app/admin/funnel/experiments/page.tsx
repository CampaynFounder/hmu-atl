'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useMarket } from '@/app/admin/components/market-context';

interface Experiment {
  id: string;
  name: string;
  zone_key: string;
  page_slug: string;
  zone_display_name: string;
  status: string;
  variant_ids: string[];
  goal_event: string;
  goal_metric: string;
  sample_size_target: number;
  started_at: string | null;
  ended_at: string | null;
  winner_variant_id: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#FFB300',
  running: '#00E676',
  paused: '#FF7043',
  completed: '#448AFF',
};

export default function ExperimentsPage() {
  const { selectedMarketId } = useMarket();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExperiments = useCallback(() => {
    const qs = selectedMarketId ? `?market_id=${selectedMarketId}` : '';
    fetch(`/api/admin/funnel/experiments${qs}`)
      .then((r) => r.json())
      .then((data) => setExperiments(data.experiments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedMarketId]);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);

  const updateStatus = async (experimentId: string, status: string, winnerVariantId?: string) => {
    await fetch('/api/admin/funnel/experiments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experiment_id: experimentId, status, winner_variant_id: winnerVariantId }),
    });
    fetchExperiments();
  };

  return (
    <div style={{ padding: '24px', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/funnel" style={{ color: 'var(--admin-text-muted)', textDecoration: 'none', fontSize: 14 }}>
          &larr; Funnel CMS
        </Link>
        <span style={{ color: 'var(--admin-text-faint)' }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--admin-text)' }}>A/B Tests</h1>
      </div>

      <p style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginBottom: 24 }}>
        Create experiments from the zone editor — select a zone, add multiple variants, then create a test here.
      </p>

      {loading ? (
        <div style={{ color: 'var(--admin-text-muted)', padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : experiments.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 12,
          background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>No experiments yet</p>
          <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 4 }}>
            Create A/B test variants in the zone editor first
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {experiments.map((exp) => (
            <div
              key={exp.id}
              style={{
                padding: '20px 24px', borderRadius: 12,
                background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--admin-text)' }}>{exp.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 4 }}>
                    {exp.page_slug} &middot; {exp.zone_display_name} &middot; {exp.variant_ids.length} variants
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-faint)', marginTop: 4 }}>
                    Goal: {exp.goal_event} ({exp.goal_metric}) &middot; Target: {exp.sample_size_target} visitors
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: 1,
                    background: `${STATUS_COLORS[exp.status] || '#666'}20`,
                    color: STATUS_COLORS[exp.status] || '#666',
                  }}>
                    {exp.status}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {exp.status === 'draft' && (
                  <button
                    onClick={() => updateStatus(exp.id, 'running')}
                    style={{
                      padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: '#00E676', color: '#000', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Start
                  </button>
                )}
                {exp.status === 'running' && (
                  <>
                    <button
                      onClick={() => updateStatus(exp.id, 'paused')}
                      style={{
                        padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: 'rgba(255,112,67,0.1)', color: '#FF7043',
                        border: '1px solid rgba(255,112,67,0.3)', cursor: 'pointer',
                      }}
                    >
                      Pause
                    </button>
                    <button
                      onClick={() => updateStatus(exp.id, 'completed')}
                      style={{
                        padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: 'rgba(68,138,255,0.1)', color: '#448AFF',
                        border: '1px solid rgba(68,138,255,0.3)', cursor: 'pointer',
                      }}
                    >
                      Complete
                    </button>
                  </>
                )}
                {exp.status === 'paused' && (
                  <button
                    onClick={() => updateStatus(exp.id, 'running')}
                    style={{
                      padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: '#00E676', color: '#000', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Resume
                  </button>
                )}
              </div>

              {exp.started_at && (
                <div style={{ fontSize: 10, color: 'var(--admin-text-faint)', marginTop: 8 }}>
                  Started {new Date(exp.started_at).toLocaleDateString()}
                  {exp.ended_at && ` — Ended ${new Date(exp.ended_at).toLocaleDateString()}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
