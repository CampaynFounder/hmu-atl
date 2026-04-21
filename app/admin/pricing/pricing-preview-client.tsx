'use client';

import { useEffect, useState } from 'react';

// Preview what marketing tier cards look like for a selected funnel stage,
// with any active public offer applied. Renders an iframe of the real /driver
// page so ops sees exactly what visitors will see.

interface FunnelStage { slug: string; label: string }

const DEFAULT_STAGES: FunnelStage[] = [
  { slug: 'awareness', label: 'Awareness' },
  { slug: 'interest', label: 'Interest' },
  { slug: 'consideration', label: 'Consideration' },
  { slug: 'conversion', label: 'Conversion' },
  { slug: 'activation', label: 'Activation' },
];

export default function PricingPreviewClient() {
  const [stages, setStages] = useState<FunnelStage[]>(DEFAULT_STAGES);
  const [stage, setStage] = useState<string>('consideration');
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    fetch('/api/admin/funnel/stages', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { stages?: Array<{ slug: string; label: string }> } | null) => {
        if (d?.stages?.length) {
          setStages(d.stages.map((s) => ({ slug: s.slug, label: s.label })));
        }
      })
      .catch(() => {});
  }, []);

  const previewUrl = `/driver?utm_funnel=${encodeURIComponent(stage)}#fees-section`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Preview</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Live render of the /driver landing page for a selected funnel stage. Reflects the current base pricing + active public offer. Cached 60s — use Refresh after saving.
        </p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-[10px] text-neutral-500 block mb-1">Funnel stage</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            {stages.map((s) => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setIframeKey((k) => k + 1)}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-sm"
        >
          Refresh
        </button>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg border border-blue-500/30 text-blue-400 text-sm"
        >
          Open in new tab ↗
        </a>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <iframe
          key={iframeKey}
          src={previewUrl}
          title="Landing page preview"
          className="w-full bg-white"
          style={{ height: '70vh', minHeight: 600 }}
        />
      </div>
    </div>
  );
}
