'use client';

// Post-onboarding companion to the profile-completion card. Surfaces the
// admin-curated Facebook groups so drivers can start promoting their HMU
// link right away — the fastest path from signup to first ride.
//
// Admin adds groups at /admin/driver-playbook/fb-groups. They show up here
// automatically. Drivers can hide individual groups they don't care about
// and dismiss the whole card for 30 days.

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

const HIDDEN_GROUPS_KEY = 'hmu_fb_groups_hidden';
const CARD_DISMISSED_KEY = 'hmu_fb_card_dismissed_at';
const CARD_DISMISS_DAYS = 30;
const INITIAL_VISIBLE = 3;

function readArr(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

function cardIsDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const v = localStorage.getItem(CARD_DISMISSED_KEY);
  if (!v) return false;
  const t = Number(v);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < CARD_DISMISS_DAYS * 86_400_000;
}

export function GetRidersQuickCard() {
  const [groups, setGroups] = useState<FbGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
  const [cardDismissed, setCardDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHiddenGroups(readArr(HIDDEN_GROUPS_KEY));
    setCardDismissed(cardIsDismissed());
    setHydrated(true);
  }, []);

  useEffect(() => {
    fetch('/api/driver/playbook/search-index')
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: PaletteItem[] }) => {
        const items = (data.items ?? []).filter(i => i.kind === 'fb_group');
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
    const caption = group.suggested_caption || `Running rides now — $25 min, no surge. HMU: atl.hmucashride.com`;
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedId(group.id);
      posthog.capture('driver_fb_caption_copied', { group_id: group.id, group_name: group.name, from: 'dashboard' });
      setTimeout(() => setCopiedId(null), 1600);
    } catch { /* clipboard unavailable */ }
  }

  function hideGroup(id: string) {
    posthog.capture('driver_fb_group_hidden', { group_id: id });
    setHiddenGroups(prev => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try { localStorage.setItem(HIDDEN_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function restoreHidden() {
    posthog.capture('driver_fb_groups_restored');
    setHiddenGroups([]);
    try { localStorage.setItem(HIDDEN_GROUPS_KEY, JSON.stringify([])); } catch { /* ignore */ }
  }

  function dismissCard() {
    posthog.capture('driver_fb_card_dismissed');
    setCardDismissed(true);
    try { localStorage.setItem(CARD_DISMISSED_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  if (loading) return null;
  if (groups.length === 0) return null;
  if (hydrated && cardDismissed) return null;

  const shown = groups.filter(g => !hiddenGroups.includes(g.id));
  const visible = expanded ? shown : shown.slice(0, INITIAL_VISIBLE);
  const hiddenHere = shown.length - visible.length;
  const hiddenByUser = groups.length - shown.length;
  const canExpand = shown.length > INITIAL_VISIBLE;

  return (
    <div
      className="rounded-2xl p-5 mx-4 mt-3 relative"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <button
        onClick={dismissCard}
        aria-label="Dismiss card for 30 days"
        className="absolute top-3 right-3 text-white/40 hover:text-white/80 transition-colors z-10"
      >
        ✕
      </button>

      <div className="mb-3 pr-6">
        <p className="text-[10px] font-bold tracking-[3px] mb-1" style={{ color: '#FF9100' }}>
          GET YOUR FIRST RIDER
        </p>
        <h3 className="text-base font-bold text-white leading-tight">
          Drop your link in {groups.length} {groups.length === 1 ? 'group' : 'groups'}.
        </h3>
        <p className="text-xs text-white/50 mt-1">
          Uber buys ads. You ARE the ad — tap a group, paste the caption, post.
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs text-white/50 mb-2">All groups hidden.</p>
          <button
            onClick={restoreHidden}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Show them again
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {visible.map(g => (
              <motion.li
                key={g.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
                className="rounded-xl"
              >
                <div
                  className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-white truncate">{g.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {g.audience && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(68,138,255,0.12)', color: '#448AFF' }}>
                          {g.audience}
                        </span>
                      )}
                      <button
                        onClick={() => hideGroup(g.id)}
                        aria-label={`Hide ${g.name}`}
                        className="text-[12px] px-1.5 rounded transition-all opacity-40 hover:opacity-100 hover:bg-white/10 active:scale-90"
                        style={{ color: 'rgba(255,255,255,0.55)' }}
                      >
                        ✕
                      </button>
                    </div>
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
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Always-visible footer row so drivers know how many there are + can reach the full playbook */}
      <div
        className="mt-3 pt-3 flex items-center justify-between gap-2 flex-wrap"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="text-[11px] flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <span>{visible.length} of {groups.length}</span>
          {canExpand && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="font-semibold underline"
              style={{ color: 'white' }}
            >
              {expanded ? 'show fewer' : `show ${hiddenHere} more`}
            </button>
          )}
          {hiddenByUser > 0 && (
            <button
              onClick={restoreHidden}
              className="font-semibold underline"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            >
              +{hiddenByUser} hidden
            </button>
          )}
        </div>
        <Link
          href="/driver/playbook#fb-groups"
          onClick={() => posthog.capture('driver_playbook_opened', { from: 'dashboard_fb_card' })}
          className="text-[11px] font-bold"
          style={{ color: '#00E676' }}
        >
          Full playbook →
        </Link>
      </div>
    </div>
  );
}
