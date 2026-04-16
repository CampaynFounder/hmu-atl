'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useMarket } from '@/app/admin/components/market-context';
import { PAGE_SLUGS } from '@/lib/cms/zone-registry';

interface PageStats {
  page_slug: string;
  zone_count: number;
  published_count: number;
  last_updated: string | null;
}

export default function FunnelCMSPage() {
  const { selectedMarketId } = useMarket();
  const [pages, setPages] = useState<PageStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/funnel/zones')
      .then((r) => r.json())
      .then((data) => {
        // Aggregate zones by page
        const grouped: Record<string, PageStats> = {};
        for (const z of data.zones || []) {
          const slug = z.page_slug as string;
          if (!grouped[slug]) {
            grouped[slug] = { page_slug: slug, zone_count: 0, published_count: 0, last_updated: null };
          }
          grouped[slug].zone_count++;
          if (z.variant_status === 'published') grouped[slug].published_count++;
          if (z.last_updated && (!grouped[slug].last_updated || z.last_updated > grouped[slug].last_updated)) {
            grouped[slug].last_updated = z.last_updated as string;
          }
        }
        setPages(Object.values(grouped));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch('/api/admin/funnel/zones', { method: 'POST' });
      const data = await res.json();
      setSeedResult(`Seeded ${data.seeded} new zones (${data.total} total in registry)`);
      // Refresh
      window.location.reload();
    } catch {
      setSeedResult('Failed to seed zones');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--admin-text)' }}>Funnel CMS</h1>
          <p style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginTop: 4 }}>
            Manage marketing copy across all logged-out pages
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href="/admin/funnel/personas"
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--admin-bg-active)', color: 'var(--admin-text)', textDecoration: 'none',
              border: '1px solid var(--admin-border)',
            }}
          >
            Personas
          </Link>
          <Link
            href="/admin/funnel/stages"
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--admin-bg-active)', color: 'var(--admin-text)', textDecoration: 'none',
              border: '1px solid var(--admin-border)',
            }}
          >
            Funnel Stages
          </Link>
          <Link
            href="/admin/funnel/flags"
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--admin-bg-active)', color: 'var(--admin-text)', textDecoration: 'none',
              border: '1px solid var(--admin-border)',
            }}
          >
            Feature Flags
          </Link>
          <Link
            href="/admin/funnel/experiments"
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--admin-bg-active)', color: 'var(--admin-text)', textDecoration: 'none',
              border: '1px solid var(--admin-border)',
            }}
          >
            A/B Tests
          </Link>
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: '#00E676', color: '#000', border: 'none', cursor: 'pointer',
              opacity: seeding ? 0.5 : 1,
            }}
          >
            {seeding ? 'Seeding...' : 'Seed Zones'}
          </button>
        </div>
      </div>

      {seedResult && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
          color: '#00E676', fontSize: 13,
        }}>
          {seedResult}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--admin-text-muted)', fontSize: 14, padding: 40, textAlign: 'center' }}>
          Loading pages...
        </div>
      ) : pages.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center',
          background: 'var(--admin-bg-active)', borderRadius: 12,
          border: '1px solid var(--admin-border)',
        }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 8 }}>
            No zones seeded yet
          </p>
          <p style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginBottom: 16 }}>
            Click &quot;Seed Zones&quot; to register all content zones from the zone registry
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {PAGE_SLUGS.map(({ slug, label, path }) => {
            const stats = pages.find((p) => p.page_slug === slug);
            const zoneCount = stats?.zone_count || 0;
            const publishedCount = stats?.published_count || 0;
            const pct = zoneCount > 0 ? Math.round((publishedCount / zoneCount) * 100) : 0;

            return (
              <Link
                key={slug}
                href={`/admin/funnel/${slug}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '20px 24px', borderRadius: 12, textDecoration: 'none',
                  background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--admin-text)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 2 }}>
                    {path} &middot; {zoneCount} zones
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: pct === 100 ? '#00E676' : 'var(--admin-text)' }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      published
                    </div>
                  </div>
                  <span style={{ color: 'var(--admin-text-muted)', fontSize: 18 }}>&rarr;</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
