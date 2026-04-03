'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  HOOK_ARCHETYPES,
  AUDIENCE_SEGMENTS,
  TEMPO_MAPS,
  CONTENT_FORMATS,
  PLATFORMS,
} from '@/lib/content/framework';

interface SavedPrompt {
  id: string;
  created_at: string;
  type: string;
  inputs: Record<string, unknown>;
  gemini_prompt: string;
  hook_text: string;
  status: string;
  notes: string;
}

interface GenerateResult {
  id?: string;
  fullText: string;
  narration: string;
}

export default function ContentGeneratorPage() {
  return (
    <Suspense fallback={<div className="text-neutral-500 p-8 text-center text-sm">Loading...</div>}>
      <ContentGenerator />
    </Suspense>
  );
}

function ContentGenerator() {
  const searchParams = useSearchParams();
  const [segment, setSegment] = useState(searchParams.get('segment') || 'frustrated');
  const [hook, setHook] = useState(searchParams.get('hook') || 'receipt');
  const [tempo, setTempo] = useState(Number(searchParams.get('tempo')) || 128);
  const [song, setSong] = useState('');
  const [characterNotes, setCharacterNotes] = useState('');
  const [viralMoment, setViralMoment] = useState('');
  const [painPoint, setPainPoint] = useState('');
  const [proofPoint, setProofPoint] = useState('');
  const [formats, setFormats] = useState<string[]>(['AI-generated (Gemini)']);
  const [platforms, setPlatforms] = useState<string[]>(['TikTok']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState('');
  const [generateType, setGenerateType] = useState<'prompt' | 'hook-only'>('prompt');

  // Saved prompts
  const [saved, setSaved] = useState<SavedPrompt[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);

  // Editable narration
  const [narration, setNarration] = useState('');

  const selectedSegment = AUDIENCE_SEGMENTS.find((s) => s.id === segment);

  const fetchSaved = useCallback(() => {
    fetch('/api/admin/content/prompts')
      .then((r) => r.json())
      .then((d) => setSaved(d.prompts || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  // Sync narration from result
  useEffect(() => {
    if (result?.narration) setNarration(result.narration);
  }, [result?.narration]);

  async function handleGenerate(type: 'prompt' | 'hook-only') {
    setLoading(true);
    setError('');
    setResult(null);
    setNarration('');
    setGenerateType(type);

    try {
      const res = await fetch('/api/admin/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, segment, hook, tempo, song, characterNotes, viralMoment,
          painPoint: painPoint || selectedSegment?.painDefault || '',
          proofPoint: proofPoint || selectedSegment?.proofDefault || '',
          format: formats, platform: platforms,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      setResult(data);
      setActivePromptId(data.id || null);
      fetchSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNarration() {
    if (!activePromptId) return;
    await fetch('/api/admin/content/prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activePromptId, narration }),
    });
    fetchSaved();
  }

  async function handleDelete(id: string) {
    await fetch('/api/admin/content/prompts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activePromptId === id) {
      setActivePromptId(null);
      setResult(null);
      setNarration('');
    }
    fetchSaved();
  }

  function loadPrompt(p: SavedPrompt) {
    const inp = p.inputs as Record<string, string | number | string[]>;
    setSegment((inp.segment as string) || 'frustrated');
    setHook((inp.hook as string) || 'receipt');
    setTempo((inp.tempo as number) || 128);
    setSong((inp.song as string) || '');
    setCharacterNotes((inp.characterNotes as string) || '');
    setViralMoment((inp.viralMoment as string) || '');
    setPainPoint((inp.painPoint as string) || '');
    setProofPoint((inp.proofPoint as string) || '');
    setFormats((inp.format as string[]) || ['AI-generated (Gemini)']);
    setPlatforms((inp.platform as string[]) || ['TikTok']);
    setResult({ fullText: p.gemini_prompt || '', narration: p.hook_text || '', id: p.id });
    setNarration(p.hook_text || '');
    setActivePromptId(p.id);
    setShowSaved(false);
  }

  function toggleItem(arr: string[], item: string, setter: (v: string[]) => void) {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  }

  const inputClass = 'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600';
  const labelClass = 'block text-xs text-neutral-400 mb-1';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Content Engine</h1>
          <p className="text-xs text-neutral-500 mt-0.5">AI-powered video prompts</p>
        </div>
        <button
          onClick={() => setShowSaved(!showSaved)}
          className="relative px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-700 text-neutral-300 hover:bg-white/5"
        >
          Saved ({saved.length})
        </button>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <NavPill href="/admin/content" active>Builder</NavPill>
        <NavPill href="/admin/content/trends">Trends</NavPill>
        <NavPill href="/admin/content/calendar">Calendar</NavPill>
        <NavPill href="/admin/content/reference">Reference</NavPill>
      </div>

      {/* Saved prompts drawer */}
      {showSaved && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-2 max-h-[50vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-semibold text-neutral-300">Saved Prompts</h3>
            <button onClick={() => setShowSaved(false)} className="text-neutral-500 text-xs">Close</button>
          </div>
          {saved.length === 0 && <p className="text-xs text-neutral-500">No saved prompts yet.</p>}
          {saved.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                activePromptId === p.id ? 'border-green-500/30 bg-green-500/5' : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <button onClick={() => loadPrompt(p)} className="flex-1 text-left min-w-0">
                <div className="text-xs font-medium text-white truncate">
                  {(p.inputs as Record<string, string>)?.hook || p.type} — {(p.inputs as Record<string, string>)?.segment || ''}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {new Date(p.created_at).toLocaleDateString()} {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-red-400/50 hover:text-red-400 text-xs px-1.5 py-0.5 flex-shrink-0"
              >
                Del
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form — single column on mobile */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        {/* Row 1: Segment + Hook */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Segment</label>
            <select value={segment} onChange={(e) => setSegment(e.target.value)} className={inputClass}>
              {AUDIENCE_SEGMENTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Hook</label>
            <select value={hook} onChange={(e) => setHook(e.target.value)} className={inputClass}>
              {HOOK_ARCHETYPES.map((h) => (
                <option key={h.id} value={h.id}>{h.number} {h.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Tempo + Song */}
        <div className="grid grid-cols-[100px,1fr] gap-3">
          <div>
            <label className={labelClass}>BPM</label>
            <input type="number" value={tempo} onChange={(e) => setTempo(Number(e.target.value) || 128)}
              min={40} max={200} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Song / Music</label>
            <input type="text" value={song} onChange={(e) => setSong(e.target.value)}
              placeholder="Song title or vibe" className={inputClass} />
          </div>
        </div>

        {/* Tempo presets */}
        <div className="flex gap-1.5 flex-wrap">
          {TEMPO_MAPS.map((t) => (
            <button key={t.id} onClick={() => setTempo(t.bpm)}
              className={`px-2.5 py-1 rounded-full text-[10px] border transition-colors ${
                tempo === t.bpm ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-neutral-800 text-neutral-500'
              }`}
            >{t.bpm} {t.name}</button>
          ))}
        </div>

        {/* Character Notes */}
        <div>
          <label className={labelClass}>Character / Vibe Notes</label>
          <textarea value={characterNotes} onChange={(e) => setCharacterNotes(e.target.value)}
            placeholder="Describe the people, energy, wardrobe, setting..."
            rows={2} className={inputClass + ' resize-y'} />
        </div>

        {/* Viral Moment */}
        <div>
          <label className={labelClass}>Viral Reference <span className="text-neutral-600">(optional)</span></label>
          <textarea value={viralMoment} onChange={(e) => setViralMoment(e.target.value)}
            placeholder="Describe or paste a link to a trending video to match..."
            rows={2} className={inputClass + ' resize-y'} />
        </div>

        {/* Pain + Proof */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Pain Point</label>
            <input type="text" value={painPoint} onChange={(e) => setPainPoint(e.target.value)}
              placeholder={selectedSegment?.painDefault?.slice(0, 40) + '...'} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Proof Point</label>
            <input type="text" value={proofPoint} onChange={(e) => setProofPoint(e.target.value)}
              placeholder={selectedSegment?.proofDefault?.slice(0, 40) + '...'} className={inputClass} />
          </div>
        </div>

        {/* Format + Platform pills */}
        <div className="space-y-2">
          <div>
            <label className={labelClass}>Format</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_FORMATS.map((f) => (
                <button key={f} onClick={() => toggleItem(formats, f, setFormats)}
                  className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                    formats.includes(f) ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'border-neutral-800 text-neutral-500'
                  }`}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Platform</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button key={p} onClick={() => toggleItem(platforms, p, setPlatforms)}
                  className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                    platforms.includes(p) ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'border-neutral-800 text-neutral-500'
                  }`}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Generate buttons */}
        <div className="flex gap-2 pt-1">
          <button onClick={() => handleGenerate('prompt')} disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-green-500 text-black font-semibold text-sm hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading && generateType === 'prompt' ? 'Generating...' : 'Generate'}
          </button>
          <button onClick={() => handleGenerate('hook-only')} disabled={loading}
            className="px-4 py-2.5 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50">
            {loading && generateType === 'hook-only' ? '...' : 'Hook Only'}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm mt-3">Generating...</p>
        </div>
      )}

      {/* Output */}
      {result && (
        <div className="space-y-4">
          {/* Narration Script — editable */}
          {(narration || result.narration) && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900">
                <h3 className="text-xs font-semibold text-green-400">Narration Script</h3>
                <div className="flex gap-1.5">
                  <CopyBtn text={narration} />
                  {activePromptId && (
                    <button onClick={handleSaveNarration}
                      className="text-[10px] px-2 py-1 rounded border border-green-500/30 text-green-400 hover:bg-green-500/10">
                      Save
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                rows={8}
                className="w-full bg-transparent p-4 text-sm text-neutral-200 leading-relaxed resize-y focus:outline-none"
                style={{ minHeight: 120, WebkitOverflowScrolling: 'touch' }}
              />
            </div>
          )}

          {/* Full Output */}
          <CopyBtn text={result.fullText} label="Copy Full Prompt" block />
          <OutputBlock title="Full Output" content={result.fullText} />
        </div>
      )}
    </div>
  );
}

function NavPill({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap flex-shrink-0 ${
        active ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
      }`}
    >{children}</Link>
  );
}

function CopyBtn({ text, label, block }: { text: string; label?: string; block?: boolean }) {
  const [copied, setCopied] = useState(false);
  function handle() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  if (block) {
    return (
      <button onClick={handle}
        className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
          copied ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/10 text-white border border-neutral-700 hover:bg-white/15'
        }`}
      >{copied ? 'Copied!' : label || 'Copy'}</button>
    );
  }
  return (
    <button onClick={handle}
      className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
    >{copied ? 'Copied!' : 'Copy'}</button>
  );
}

function OutputBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900">
        <h3 className="text-xs font-semibold text-neutral-300">{title}</h3>
        <CopyBtn text={content} />
      </div>
      <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: '70vh', WebkitOverflowScrolling: 'touch' }}>
        <pre className="p-4 text-xs text-neutral-300 font-mono whitespace-pre-wrap leading-relaxed">{content}</pre>
      </div>
    </div>
  );
}
