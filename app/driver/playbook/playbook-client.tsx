'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import { TipsPreferenceToggle } from '@/components/driver/tips-preference-toggle';
import type { PlaybookSection } from '@/content/driver-playbook';

interface HeroCopy {
  lines: string[];
  tail: string;
}

interface FbGroup {
  id: string;
  name: string;
  url: string;
  audience: string | null;
  suggested_caption: string | null;
  why_this_group: string | null;
}

interface Props {
  hero: HeroCopy;
  sections: PlaybookSection[];
  fbGroups: FbGroup[];
}

const FADE_UP = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};
const STAGGER_PARENT = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const EASE = [0.25, 0.1, 0.25, 1] as const;
const INITIAL_FB_VISIBLE = 3;
const ENGAGED_KEY = 'hmu_playbook_engaged_sections';

function readEngaged(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ENGAGED_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

function writeEngaged(ids: string[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(ENGAGED_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

export default function PlaybookClient({ hero, sections, fbGroups }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [engaged, setEngaged] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEngaged(readEngaged());
    setHydrated(true);
  }, []);

  // The progressive shimmer sits on the FIRST section the user hasn't opened
  // yet. As they engage, it moves down the page, pulling them through the
  // full onboarding flow.
  const shimmerSlug = hydrated
    ? (sections.find(s => !engaged.includes(s.slug))?.slug ?? null)
    : null;

  const markEngaged = useCallback((slug: string) => {
    setEngaged(prev => {
      if (prev.includes(slug)) return prev;
      const next = [...prev, slug];
      writeEngaged(next);
      posthog.capture('driver_playbook_section_engaged', { slug, engaged_count: next.length });
      return next;
    });
  }, []);

  async function copyCaption(group: FbGroup) {
    const caption = group.suggested_caption || `Running rides — HMU: [your link]`;
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedId(group.id);
      posthog.capture('driver_fb_caption_copied', { group_id: group.id, group_name: group.name });
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  return (
    <div className="min-h-screen text-white" style={{ background: '#080808' }}>
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3" style={{ background: '#080808', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/driver/dashboard" aria-label="Back" className="p-1 -ml-1">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold">Driver Playbook</h1>
      </header>

      <motion.section className="px-5 pt-8 pb-8" initial="hidden" animate="show" variants={STAGGER_PARENT}>
        <div className="space-y-1">
          {hero.lines.map((line, i) => (
            <motion.p
              key={i}
              variants={FADE_UP}
              transition={{ duration: 0.5, ease: EASE }}
              className="text-2xl sm:text-3xl font-bold leading-tight"
              style={{ color: i === hero.lines.length - 1 ? '#00E676' : 'white' }}
            >
              {line}
            </motion.p>
          ))}
        </div>
        <motion.p
          variants={FADE_UP}
          transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
          className="mt-5 text-base font-bold text-white/90"
        >
          {hero.tail}
        </motion.p>
      </motion.section>

      <motion.nav
        className="sticky top-[52px] z-10 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar"
        style={{ background: '#080808', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.25 }}
      >
        {sections.map(s => (
          <a
            key={s.slug}
            href={`#${s.slug}`}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-transform active:scale-95"
            style={{
              background: s.slug === shimmerSlug ? '#00E676' : 'rgba(255,255,255,0.06)',
              color: s.slug === shimmerSlug ? '#080808' : 'white',
            }}
          >
            {s.icon} {s.title}
          </a>
        ))}
      </motion.nav>

      <div className="px-5 py-6 space-y-3">
        {sections.map(section => (
          <CollapsibleSection
            key={section.slug}
            section={section}
            fbGroups={section.slug === 'get-riders' ? fbGroups : null}
            copiedId={copiedId}
            onCopyCaption={copyCaption}
            shimmer={hydrated && section.slug === shimmerSlug}
            onEngaged={() => markEngaged(section.slug)}
          />
        ))}
      </div>

      <motion.section
        className="px-5 pb-10 pt-4"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <p className="text-[10px] font-bold tracking-[3px] mb-3 text-white/40">PREFERENCES</p>
        <TipsPreferenceToggle />
      </motion.section>

      <div className="h-24" />

      <style jsx global>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        html { scroll-behavior: smooth; }

        /* Shimmer / glow for the "next up" collapsed section. Gentle 3-beat
           pulse — inviting, not demanding. Overlay is absolutely positioned
           and pointer-events:none so it never blocks the tap target. */
        .section-shimmer {
          position: relative;
          animation: sectionGlow 2.8s ease-in-out infinite;
        }
        .section-shimmer::before {
          content: '';
          position: absolute; inset: 0; border-radius: inherit;
          background: linear-gradient(100deg, transparent 0%, rgba(0,230,118,0.22) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: sectionSweep 2.8s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        @keyframes sectionGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,230,118,0); }
          50% { box-shadow: 0 0 24px 0 rgba(0,230,118,0.18); }
        }
        @keyframes sectionSweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Breathing accent on the chevron itself inside a shimmering section. */
        .chevron-shimmer {
          animation: chevronBreath 2.8s ease-in-out infinite;
        }
        @keyframes chevronBreath {
          0%, 100% { background: rgba(0,230,118,0.16); color: #00E676; transform: scale(1); }
          50% { background: rgba(0,230,118,0.32); color: #00E676; transform: scale(1.06); }
        }
      `}</style>
    </div>
  );
}

interface CollapsibleSectionProps {
  section: PlaybookSection;
  fbGroups: FbGroup[] | null;
  copiedId: string | null;
  onCopyCaption: (g: FbGroup) => void;
  shimmer: boolean;
  onEngaged: () => void;
}

function CollapsibleSection({ section, fbGroups, copiedId, onCopyCaption, shimmer, onEngaged }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Expanding = user engaged. Moves the shimmer to the next section.
      onEngaged();
    }
    posthog.capture(next ? 'driver_playbook_section_opened' : 'driver_playbook_section_closed', {
      slug: section.slug,
    });
  }

  // Shimmer sits on the section while it's closed AND this is the next-up
  // section. If the user opens it, shimmer drops immediately (onEngaged).
  // If they leave it closed and move on, shimmer stays until they engage it.
  const showShimmer = shimmer && !open;

  return (
    <section
      id={section.slug}
      className={`scroll-mt-28 rounded-2xl overflow-hidden relative ${showShimmer ? 'section-shimmer' : ''}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: open
          ? '1px solid rgba(0,230,118,0.4)'
          : showShimmer
            ? '1px solid rgba(0,230,118,0.35)'
            : '1px solid rgba(255,255,255,0.06)',
        transition: 'border-color 200ms ease',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full px-5 py-5 flex items-center gap-3 text-left transition-colors hover:bg-white/[0.02] active:bg-white/[0.04] relative z-[2]"
      >
        <span className="text-2xl shrink-0">{section.icon}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-white leading-tight">{section.title}</h2>
          <p
            className="text-xs mt-1 truncate"
            style={{ color: open || showShimmer ? '#00E676' : 'rgba(255,255,255,0.55)' }}
          >
            {section.headline}
          </p>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className={`inline-flex items-center justify-center w-11 h-11 rounded-xl shrink-0 text-base font-bold ${showShimmer ? 'chevron-shimmer' : ''}`}
          style={!showShimmer ? {
            background: open ? 'rgba(0,230,118,0.14)' : 'rgba(255,255,255,0.08)',
            color: open ? '#00E676' : 'white',
          } : undefined}
          aria-hidden
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{ overflow: 'hidden', position: 'relative', zIndex: 2 }}
          >
            <div className="px-5 pb-5">
              <p className="text-sm text-white/70 mb-4 leading-relaxed">{section.lead}</p>

              <ul className="space-y-2.5">
                {section.bullets.map((b, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: EASE, delay: i * 0.04 }}
                    className="rounded-xl p-3.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <p className="font-semibold text-sm">{b.text}</p>
                    {b.sub && <p className="text-xs text-white/60 mt-1 leading-relaxed">{b.sub}</p>}
                  </motion.li>
                ))}
              </ul>

              {fbGroups && (
                <div id="fb-groups">
                  <InlineFbGroups
                    groups={fbGroups}
                    copiedId={copiedId}
                    onCopyCaption={onCopyCaption}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

interface InlineFbGroupsProps {
  groups: FbGroup[];
  copiedId: string | null;
  onCopyCaption: (g: FbGroup) => void;
}

function InlineFbGroups({ groups, copiedId, onCopyCaption }: InlineFbGroupsProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? groups : groups.slice(0, INITIAL_FB_VISIBLE);
  const hasMore = groups.length > INITIAL_FB_VISIBLE;

  if (groups.length === 0) {
    return (
      <div className="mt-5 rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}>
        <p className="text-xs text-white/50">Admin hasn&apos;t added groups for your market yet — check back soon.</p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <p className="text-[10px] font-bold tracking-[3px] mb-2" style={{ color: '#00E676' }}>
        {groups.length} {groups.length === 1 ? 'GROUP' : 'GROUPS'} · TAP TO JOIN
      </p>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {visible.map(g => (
            <motion.li
              key={g.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
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
              {g.why_this_group && (
                <p className="text-[11px] text-white/55 mb-2">{g.why_this_group}</p>
              )}
              {g.suggested_caption && (
                <p
                  className="text-[11px] italic mb-2 px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.75)' }}
                >
                  &quot;{g.suggested_caption}&quot;
                </p>
              )}
              <div className="flex gap-2">
                <motion.a
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => posthog.capture('driver_fb_group_opened', { group_id: g.id, group_name: g.name })}
                  whileTap={{ scale: 0.96 }}
                  className="flex-1 text-center text-[11px] font-semibold py-2 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}
                >
                  Open group
                </motion.a>
                <motion.button
                  onClick={() => onCopyCaption(g)}
                  whileTap={{ scale: 0.96 }}
                  animate={copiedId === g.id ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.35 }}
                  className="flex-1 text-[11px] font-bold py-2 rounded-lg"
                  style={{ background: '#00E676', color: '#080808' }}
                >
                  {copiedId === g.id ? 'Copied ✓' : 'Copy caption'}
                </motion.button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {hasMore && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="mt-2 w-full text-[11px] font-semibold py-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          {showAll ? 'Show fewer' : `Show ${groups.length - INITIAL_FB_VISIBLE} more`}
        </button>
      )}
    </div>
  );
}
