'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
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

// Reusable animation presets — easeOut curve, consistent timing across the page
const FADE_UP = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};
const STAGGER_PARENT = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const EASE = [0.25, 0.1, 0.25, 1] as const;

export default function PlaybookClient({ hero, sections, fbGroups }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      {/* Header */}
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3" style={{ background: '#080808', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/driver/dashboard" aria-label="Back" className="p-1 -ml-1">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold">Get Riders</h1>
      </header>

      {/* Hero — staggered line-by-line entry */}
      <motion.section
        className="px-5 pt-8 pb-8"
        initial="hidden"
        animate="show"
        variants={STAGGER_PARENT}
      >
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

      {/* Section nav pills */}
      <motion.nav
        className="sticky top-[52px] z-10 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar"
        style={{ background: '#080808', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.25 }}
      >
        <a
          href="#fb-groups"
          className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full transition-transform active:scale-95"
          style={{ background: '#00E676', color: '#080808' }}
        >
          👥 FB Groups
        </a>
        {sections.map(s => (
          <a
            key={s.slug}
            href={`#${s.slug}`}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-transform active:scale-95"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}
          >
            {s.icon} {s.title}
          </a>
        ))}
      </motion.nav>

      <div className="px-5 py-8 space-y-12">
        {/* FB Groups — moved to top so "Find Riders Here:" in the hero points
            directly at it. Tiles stagger in on page load. */}
        <motion.section
          id="fb-groups"
          className="scroll-mt-28"
          initial="hidden"
          animate="show"
          variants={STAGGER_PARENT}
        >
          <motion.div variants={FADE_UP} transition={{ duration: 0.4, ease: EASE }} className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl">👥</span>
            <h2 className="text-xl font-bold">FB Groups</h2>
          </motion.div>
          <motion.p variants={FADE_UP} transition={{ duration: 0.4, ease: EASE }} className="text-lg font-semibold mb-2" style={{ color: '#00E676' }}>
            Drop your link in these groups.
          </motion.p>
          <motion.p variants={FADE_UP} transition={{ duration: 0.4, ease: EASE }} className="text-sm text-white/70 mb-4">
            Tap &quot;Open&quot; to go to the group. Tap &quot;Copy&quot; to grab a caption that works.
          </motion.p>
          {fbGroups.length === 0 ? (
            <motion.p variants={FADE_UP} transition={{ duration: 0.4, ease: EASE }} className="text-sm text-white/50">
              Admin hasn&apos;t added groups for your market yet — check back soon.
            </motion.p>
          ) : (
            <ul className="space-y-3">
              {fbGroups.map(g => (
                <motion.li
                  key={g.id}
                  variants={FADE_UP}
                  transition={{ duration: 0.4, ease: EASE }}
                  whileHover={{ y: -2, transition: { duration: 0.15 } }}
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{g.name}</p>
                      {g.audience && (
                        <span className="inline-block text-[10px] uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded" style={{ background: 'rgba(68,138,255,0.12)', color: '#448AFF' }}>
                          {g.audience}
                        </span>
                      )}
                    </div>
                  </div>
                  {g.why_this_group && (
                    <p className="text-xs text-white/60 mb-2">{g.why_this_group}</p>
                  )}
                  {g.suggested_caption && (
                    <p
                      className="text-xs italic mb-3 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)' }}
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
                      className="flex-1 text-center text-xs font-semibold py-2 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}
                    >
                      Open group
                    </motion.a>
                    <motion.button
                      onClick={() => copyCaption(g)}
                      whileTap={{ scale: 0.96 }}
                      animate={copiedId === g.id ? { scale: [1, 1.05, 1] } : {}}
                      transition={{ duration: 0.35 }}
                      className="flex-1 text-xs font-bold py-2 rounded-lg"
                      style={{ background: '#00E676', color: '#080808' }}
                    >
                      {copiedId === g.id ? 'Copied ✓' : 'Copy caption'}
                    </motion.button>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* Content sections — fade-up on viewport entry, staggered bullets */}
        {sections.map(section => (
          <motion.section
            key={section.slug}
            id={section.slug}
            className="scroll-mt-28"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={STAGGER_PARENT}
          >
            <motion.div variants={FADE_UP} transition={{ duration: 0.4, ease: EASE }} className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl">{section.icon}</span>
              <h2 className="text-xl font-bold">{section.title}</h2>
            </motion.div>
            <motion.p variants={FADE_UP} transition={{ duration: 0.4, ease: EASE }} className="text-lg font-semibold mb-2" style={{ color: '#00E676' }}>
              {section.headline}
            </motion.p>
            <motion.p variants={FADE_UP} transition={{ duration: 0.4, ease: EASE }} className="text-sm text-white/70 mb-4">
              {section.lead}
            </motion.p>
            <ul className="space-y-3">
              {section.bullets.map((b, i) => (
                <motion.li
                  key={i}
                  variants={FADE_UP}
                  transition={{ duration: 0.35, ease: EASE }}
                  whileHover={{ x: 2, transition: { duration: 0.15 } }}
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="font-semibold text-sm">{b.text}</p>
                  {b.sub && <p className="text-xs text-white/60 mt-1">{b.sub}</p>}
                </motion.li>
              ))}
            </ul>
          </motion.section>
        ))}
      </div>

      {/* Preferences */}
      <motion.section
        className="px-5 pb-10"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <p className="text-[10px] font-bold tracking-[3px] mb-3 text-white/40">PREFERENCES</p>
        <TipsPreferenceToggle />
      </motion.section>

      <div className="h-24" />

      <style jsx>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}
