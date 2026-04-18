'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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

      {/* Hero — economics narrative */}
      <section className="px-5 pt-8 pb-10">
        <div className="space-y-1">
          {hero.lines.map((line, i) => (
            <p
              key={i}
              className="text-2xl sm:text-3xl font-bold leading-tight"
              style={{ color: i === hero.lines.length - 1 ? '#00E676' : 'white' }}
            >
              {line}
            </p>
          ))}
        </div>
        <p className="mt-4 text-sm text-white/70">{hero.tail}</p>
      </section>

      {/* Section nav pills */}
      <nav className="sticky top-[52px] z-10 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar" style={{ background: '#080808', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {sections.map(s => (
          <a
            key={s.slug}
            href={`#${s.slug}`}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}
          >
            {s.icon} {s.title}
          </a>
        ))}
        <a
          href="#fb-groups"
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(0,230,118,0.14)', color: '#00E676' }}
        >
          👥 FB Groups
        </a>
      </nav>

      {/* Sections */}
      <div className="px-5 py-8 space-y-12">
        {sections.map(section => (
          <section key={section.slug} id={section.slug} className="scroll-mt-28">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl">{section.icon}</span>
              <h2 className="text-xl font-bold">{section.title}</h2>
            </div>
            <p className="text-lg font-semibold mb-2" style={{ color: '#00E676' }}>
              {section.headline}
            </p>
            <p className="text-sm text-white/70 mb-4">{section.lead}</p>
            <ul className="space-y-3">
              {section.bullets.map((b, i) => (
                <li
                  key={i}
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="font-semibold text-sm">{b.text}</p>
                  {b.sub && <p className="text-xs text-white/60 mt-1">{b.sub}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* FB Groups */}
        <section id="fb-groups" className="scroll-mt-28">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl">👥</span>
            <h2 className="text-xl font-bold">FB Groups</h2>
          </div>
          <p className="text-lg font-semibold mb-2" style={{ color: '#00E676' }}>
            Drop your link in these groups.
          </p>
          <p className="text-sm text-white/70 mb-4">
            Tap &quot;Open&quot; to go to the group. Tap &quot;Copy&quot; to grab a caption that works.
          </p>
          {fbGroups.length === 0 ? (
            <p className="text-sm text-white/50">Admin hasn&apos;t added groups for your market yet — check back soon.</p>
          ) : (
            <ul className="space-y-3">
              {fbGroups.map(g => (
                <li
                  key={g.id}
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
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => posthog.capture('driver_fb_group_opened', { group_id: g.id, group_name: g.name })}
                      className="flex-1 text-center text-xs font-semibold py-2 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}
                    >
                      Open group
                    </a>
                    <button
                      onClick={() => copyCaption(g)}
                      className="flex-1 text-xs font-bold py-2 rounded-lg"
                      style={{ background: '#00E676', color: '#080808' }}
                    >
                      {copiedId === g.id ? 'Copied ✓' : 'Copy caption'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Preferences */}
      <section className="px-5 pb-10">
        <p className="text-[10px] font-bold tracking-[3px] mb-3 text-white/40">PREFERENCES</p>
        <TipsPreferenceToggle />
      </section>

      <div className="h-24" />

      <style jsx>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
