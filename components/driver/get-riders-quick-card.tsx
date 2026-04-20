'use client';

// Post-onboarding companion to the profile-completion card. Surfaces the
// admin-curated Facebook groups so drivers can start promoting their HMU
// link right away — the fastest path from signup to first ride.
// Fetches the live list on mount so new admin-added groups appear without
// a dashboard redeploy.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';

interface FbGroup {
  id: string;
  name: string;
  url: string;
  audience: string | null;
  suggested_caption: string | null;
}

interface PaletteItem {
  id: string;
  kind: 'playbook' | 'fb_group' | 'faq';
  title: string;
  subtitle?: string | null;
  href: string;
}

export function GetRidersQuickCard() {
  const [groups, setGroups] = useState<FbGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/driver/playbook/search-index')
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: PaletteItem[] }) => {
        const items = (data.items ?? []).filter(i => i.kind === 'fb_group');
        // Palette search-index returns a minimal set for the command palette.
        // Map back to the shape this card needs. No suggested_caption from
        // that endpoint — we'll load it lazily per-click if needed.
        setGroups(items.map(i => ({
          id: i.id,
          name: i.title,
          url: i.href,
          audience: i.subtitle ?? null,
          suggested_caption: null,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function copyCaption(group: FbGroup) {
    const caption = group.suggested_caption ||
      `Running rides now — $25 min, no surge. HMU: atl.hmucashride.com`;
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedId(group.id);
      posthog.capture('driver_fb_caption_copied', { group_id: group.id, group_name: group.name, from: 'dashboard' });
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  if (loading) return null;
  if (groups.length === 0) return null;

  const visible = expanded ? groups : groups.slice(0, 3);

  return (
    <div
      className="rounded-2xl p-5 mx-4 mt-3"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-bold tracking-[3px] mb-1" style={{ color: '#FF9100' }}>
            GET YOUR FIRST RIDER
          </p>
          <h3 className="text-base font-bold text-white leading-tight">
            Drop your link in these {groups.length} groups.
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Uber buys ads. You ARE the ad — tap a group, paste the caption, post.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {visible.map(g => (
            <motion.li
              key={g.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-white truncate">{g.name}</p>
                {g.audience && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(68,138,255,0.12)', color: '#448AFF' }}>
                    {g.audience}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <a
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => posthog.capture('driver_fb_group_opened', { group_id: g.id, group_name: g.name, from: 'dashboard' })}
                  className="flex-1 text-center text-[11px] font-semibold py-2 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}
                >
                  Open group
                </a>
                <button
                  onClick={() => copyCaption(g)}
                  className="flex-1 text-[11px] font-bold py-2 rounded-lg"
                  style={{ background: '#00E676', color: '#080808' }}
                >
                  {copiedId === g.id ? 'Copied ✓' : 'Copy caption'}
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div className="flex items-center justify-between mt-3">
        {groups.length > 3 ? (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[11px] font-semibold"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            {expanded ? 'Show fewer' : `Show ${groups.length - 3} more`}
          </button>
        ) : <span />}
        <Link
          href="/driver/playbook#fb-groups"
          onClick={() => posthog.capture('driver_playbook_opened', { from: 'dashboard_fb_card' })}
          className="text-[11px] font-semibold"
          style={{ color: '#00E676' }}
        >
          Full playbook →
        </Link>
      </div>
    </div>
  );
}
