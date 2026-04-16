'use client';

import { useState, useEffect } from 'react';
import type { FunnelStageRow } from '@/lib/cms/types';

export function StageSelector({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (slug: string) => void;
}) {
  const [stages, setStages] = useState<FunnelStageRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/funnel/stages')
      .then((r) => r.json())
      .then((data) => setStages(data.stages || []))
      .catch(() => {});
  }, []);

  if (stages.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {stages.map((stage) => (
        <button
          key={stage.slug}
          onClick={() => onSelect(stage.slug)}
          style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            border: selected === stage.slug ? `2px solid ${stage.color}` : '2px solid var(--admin-border)',
            background: selected === stage.slug ? `${stage.color}15` : 'transparent',
            color: selected === stage.slug ? stage.color : 'var(--admin-text-secondary)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {stage.label}
          {stage.is_default && (
            <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.6 }}>default</span>
          )}
        </button>
      ))}
    </div>
  );
}
