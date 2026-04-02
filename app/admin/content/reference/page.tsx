'use client';

import Link from 'next/link';
import {
  HOOK_ARCHETYPES,
  AUDIENCE_SEGMENTS,
  PAIN_MATRIX,
  TEMPO_MAPS,
  PSYCH_FRAMEWORKS,
  CTA_BANK,
} from '@/lib/content/framework';

export default function ContentReferencePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Engine</h1>
        <p className="text-sm text-neutral-400 mt-1">Framework reference</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/admin/content" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Prompt Builder</Link>
        <Link href="/admin/content/trends" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Trend Hijack</Link>
        <Link href="/admin/content/calendar" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Calendar</Link>
        <Link href="/admin/content/reference" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white">Reference</Link>
      </div>

      {/* Hook Archetypes */}
      <section>
        <h2 className="text-sm font-bold text-neutral-300 mb-3 tracking-wide uppercase">8 Hook Archetypes</h2>
        <div className="space-y-2">
          {HOOK_ARCHETYPES.map((h) => (
            <details key={h.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden group">
              <summary className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors flex items-center gap-3">
                <span className="text-green-500 font-bold text-xs">{h.number}</span>
                <span className="text-sm font-semibold text-white">{h.name}</span>
                <span className="text-xs text-neutral-500 ml-auto">{h.title}</span>
              </summary>
              <div className="px-4 pb-4 space-y-2 text-xs border-t border-neutral-800 pt-3">
                <div><span className="text-neutral-500">Psychology:</span> <span className="text-neutral-300">{h.psychology}</span></div>
                <div><span className="text-neutral-500">Visual:</span> <span className="text-neutral-300">{h.visual}</span></div>
                <div><span className="text-neutral-500">VO:</span> <span className="text-neutral-300 italic">{h.vo}</span></div>
                <div><span className="text-neutral-500">Text overlay:</span> <span className="text-green-400">{h.text}</span></div>
                <div><span className="text-neutral-500">Example:</span> <span className="text-neutral-400 italic">{h.example}</span></div>
                <div className="mt-2 p-2 bg-neutral-950 rounded-lg">
                  <span className="text-neutral-500">Prompt instruction:</span>
                  <span className="text-neutral-300 block mt-1">{h.promptInstruction}</span>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Audience DNA */}
      <section>
        <h2 className="text-sm font-bold text-neutral-300 mb-3 tracking-wide uppercase">Audience Segments</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {AUDIENCE_SEGMENTS.map((s) => (
            <div key={s.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-xs font-bold text-green-400 mb-1">{s.badge}</div>
              <div className="text-sm font-semibold text-white mb-2">{s.label}</div>
              <div className="space-y-1.5 text-xs text-neutral-400">
                <div><span className="text-neutral-500">Avatar:</span> {s.avatar}</div>
                <div><span className="text-neutral-500">Default pain:</span> {s.painDefault}</div>
                <div><span className="text-neutral-500">Default proof:</span> {s.proofDefault}</div>
                <div><span className="text-neutral-500">Environment:</span> {s.environment}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pain Matrix */}
      <section>
        <h2 className="text-sm font-bold text-neutral-300 mb-3 tracking-wide uppercase">Pain Matrix — 6 Emotional Triggers</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {PAIN_MATRIX.map((p) => (
            <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/10 text-red-400">{p.badge}</span>
                <span className="text-sm font-semibold text-white">{p.name}</span>
              </div>
              <p className="text-xs text-neutral-400 mb-2">{p.description}</p>
              <div className="text-xs"><span className="text-green-500">Solution:</span> <span className="text-neutral-300">{p.solution}</span></div>
              <div className="text-xs mt-1"><span className="text-yellow-500">Stat:</span> <span className="text-neutral-300">{p.stat}</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* Tempo Maps */}
      <section>
        <h2 className="text-sm font-bold text-neutral-300 mb-3 tracking-wide uppercase">Tempo Engine</h2>
        <div className="space-y-3">
          {TEMPO_MAPS.map((t) => (
            <details key={t.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors flex items-center gap-4">
                <span className="text-2xl font-bold text-white">{t.bpm}</span>
                <div>
                  <div className="text-sm font-semibold text-white">{t.name} ({t.bpmRange} BPM)</div>
                  <div className="text-xs text-neutral-500">{t.feel} {t.bestFor}</div>
                </div>
              </summary>
              <div className="px-4 pb-4 space-y-2 text-xs border-t border-neutral-800 pt-3">
                <div className="grid grid-cols-3 gap-3">
                  <div><span className="text-neutral-500">Bar length:</span> <span className="text-neutral-300">~{t.barLength}s</span></div>
                  <div><span className="text-neutral-500">Cuts/30s:</span> <span className="text-neutral-300">{t.cutsPerThirty}</span></div>
                  <div><span className="text-neutral-500">Max words/line:</span> <span className="text-neutral-300">{t.maxWords}</span></div>
                </div>
                <div><span className="text-neutral-500">Song rec:</span> <span className="text-neutral-300">{t.songRec}</span></div>
                <pre className="mt-2 p-3 bg-neutral-950 rounded-lg text-[11px] text-neutral-400 whitespace-pre-wrap leading-relaxed">{t.timingMap}</pre>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Psych Frameworks */}
      <section>
        <h2 className="text-sm font-bold text-neutral-300 mb-3 tracking-wide uppercase">8 Psychological Frameworks</h2>
        <div className="space-y-2">
          {PSYCH_FRAMEWORKS.map((p) => (
            <details key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-green-500/10 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{p.id}</span>
                <span className="text-sm font-semibold text-white">{p.name}</span>
                <span className="text-xs text-neutral-500 ml-auto">({p.author})</span>
              </summary>
              <div className="px-4 pb-4 space-y-2 text-xs border-t border-neutral-800 pt-3">
                <div><span className="text-neutral-500">Principle:</span> <span className="text-neutral-300">{p.principle}</span></div>
                <div><span className="text-neutral-500">Application:</span> <span className="text-neutral-300">{p.application}</span></div>
                <div><span className="text-neutral-500">In content:</span> <span className="text-neutral-300">{p.inContent}</span></div>
                <div className="mt-2 p-2 bg-neutral-950 rounded-lg">
                  <span className="text-neutral-500">Prompt instruction:</span>
                  <span className="text-neutral-300 block mt-1">{p.promptInstruction}</span>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA Bank */}
      <section>
        <h2 className="text-sm font-bold text-neutral-300 mb-3 tracking-wide uppercase">CTA Bank</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {CTA_BANK.map((c) => (
            <div key={c.name} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-xs font-bold text-green-400 mb-2">{c.name}</div>
              <ul className="space-y-1.5">
                {c.ctas.map((cta, i) => (
                  <li key={i} className="text-xs text-neutral-300">&quot;{cta}&quot;</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
