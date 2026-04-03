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

  // Form state
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

  // Generation state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState('');
  const [generateType, setGenerateType] = useState<'prompt' | 'hook-only'>('prompt');
  const [narration, setNarration] = useState('');
  const [activePromptId, setActivePromptId] = useState<string | null>(null);

  // Saved prompts
  const [saved, setSaved] = useState<SavedPrompt[]>([]);
  const [showLoad, setShowLoad] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const selectedSegment = AUDIENCE_SEGMENTS.find((s) => s.id === segment);

  const fetchSaved = useCallback(() => {
    fetch('/api/admin/content/prompts')
      .then((r) => r.json())
      .then((d) => setSaved(d.prompts || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);
  useEffect(() => { if (result?.narration) setNarration(result.narration); }, [result?.narration]);

  function getCurrentInputs() {
    return {
      type: generateType, segment, hook, tempo, song, characterNotes, viralMoment,
      painPoint: painPoint || selectedSegment?.painDefault || '',
      proofPoint: proofPoint || selectedSegment?.proofDefault || '',
      format: formats, platform: platforms,
    };
  }

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
        body: JSON.stringify({ ...getCurrentInputs(), type }),
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

  async function handleSave() {
    setSaveStatus('saving');
    try {
      const body: Record<string, unknown> = {
        inputs: getCurrentInputs(),
        narration,
      };
      if (activePromptId) {
        body.id = activePromptId;
      }
      if (result?.fullText) {
        body.fullText = result.fullText;
      }
      body.type = generateType;

      const res = await fetch('/api/admin/content/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.id) setActivePromptId(data.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      fetchSaved();
    } catch {
      setSaveStatus('idle');
    }
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
    setResult(p.gemini_prompt ? { fullText: p.gemini_prompt, narration: p.hook_text || '', id: p.id } : null);
    setNarration(p.hook_text || '');
    setActivePromptId(p.id);
    setShowLoad(false);
  }

  function toggleItem(arr: string[], item: string, setter: (v: string[]) => void) {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  }

  const inp = 'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600';
  const lbl = 'block text-[11px] text-neutral-500 mb-1 font-medium';

  return (
    <div className="space-y-3 pb-8">
      {/* Sub-nav */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
        <NavPill href="/admin/content" active>Builder</NavPill>
        <NavPill href="/admin/content/trends">Trends</NavPill>
        <NavPill href="/admin/content/calendar">Calendar</NavPill>
        <NavPill href="/admin/content/reference">Reference</NavPill>
      </div>

      {/* ===== LOAD SAVED — top of page ===== */}
      <button
        onClick={() => setShowLoad(!showLoad)}
        className="w-full py-2 rounded-lg border border-neutral-800 text-xs text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors flex items-center justify-center gap-2"
      >
        <span>Load Saved</span>
        <span className="bg-neutral-800 text-neutral-400 text-[10px] px-1.5 py-0.5 rounded-full">{saved.length}</span>
      </button>

      {showLoad && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="max-h-[40vh] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            {saved.length === 0 && (
              <p className="text-xs text-neutral-500 p-4 text-center">No saved configs yet. Generate something first.</p>
            )}
            {saved.map((p) => {
              const inp = p.inputs as Record<string, string>;
              const hookName = HOOK_ARCHETYPES.find((h) => h.id === inp?.hook)?.name || inp?.hook || '';
              const segName = AUDIENCE_SEGMENTS.find((s) => s.id === inp?.segment)?.label || inp?.segment || '';
              return (
                <div
                  key={p.id}
                  className={`flex items-center border-b border-neutral-800 last:border-b-0 ${
                    activePromptId === p.id ? 'bg-green-500/5' : ''
                  }`}
                >
                  <button onClick={() => loadPrompt(p)} className="flex-1 text-left p-3 min-w-0">
                    <div className="text-xs font-medium text-white truncate">{hookName}</div>
                    <div className="text-[10px] text-neutral-500 truncate">{segName} &middot; {inp?.tempo || ''}bpm &middot; {inp?.song || 'no song'}</div>
                  </button>
                  <button onClick={() => handleDelete(p.id)}
                    className="text-red-400/40 hover:text-red-400 text-[10px] px-3 py-3 flex-shrink-0">
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== CONFIG FORM ===== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-3">
        {/* Segment + Hook */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Segment</label>
            <select value={segment} onChange={(e) => setSegment(e.target.value)} className={inp}>
              {AUDIENCE_SEGMENTS.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
            </select>
          </div>
          <div>
            <label className={lbl}>Hook</label>
            <select value={hook} onChange={(e) => setHook(e.target.value)} className={inp}>
              {HOOK_ARCHETYPES.map((h) => (<option key={h.id} value={h.id}>{h.number} {h.name}</option>))}
            </select>
          </div>
        </div>

        {/* BPM + Song */}
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <div>
            <label className={lbl}>BPM</label>
            <input type="number" value={tempo} onChange={(e) => setTempo(Number(e.target.value) || 128)}
              min={40} max={200} className={inp} />
          </div>
          <div>
            <label className={lbl}>Song / Music</label>
            <input type="text" value={song} onChange={(e) => setSong(e.target.value)}
              placeholder="Title or vibe" className={inp} />
          </div>
        </div>

        {/* Tempo presets */}
        <div className="flex gap-1.5 flex-wrap">
          {TEMPO_MAPS.map((t) => (
            <button key={t.id} onClick={() => setTempo(t.bpm)}
              className={`px-2 py-0.5 rounded-full text-[10px] border ${
                tempo === t.bpm ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-neutral-800 text-neutral-500'
              }`}>{t.bpm} {t.name}</button>
          ))}
        </div>

        {/* Character */}
        <div>
          <label className={lbl}>Character / Vibe</label>
          <textarea value={characterNotes} onChange={(e) => setCharacterNotes(e.target.value)}
            placeholder="People, energy, wardrobe, setting..."
            rows={2} className={inp + ' resize-y'} />
        </div>

        {/* Viral */}
        <div>
          <label className={lbl}>Viral Reference <span className="text-neutral-600">(optional)</span></label>
          <textarea value={viralMoment} onChange={(e) => setViralMoment(e.target.value)}
            placeholder="Describe or paste link to a trending video..."
            rows={2} className={inp + ' resize-y'} />
        </div>

        {/* Pain + Proof */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Pain Point</label>
            <input type="text" value={painPoint} onChange={(e) => setPainPoint(e.target.value)}
              placeholder={selectedSegment?.painDefault?.slice(0, 35) + '...'} className={inp} />
          </div>
          <div>
            <label className={lbl}>Proof Point</label>
            <input type="text" value={proofPoint} onChange={(e) => setProofPoint(e.target.value)}
              placeholder={selectedSegment?.proofDefault?.slice(0, 35) + '...'} className={inp} />
          </div>
        </div>

        {/* Format + Platform */}
        <div className="space-y-2">
          <div>
            <label className={lbl}>Format</label>
            <div className="flex flex-wrap gap-1">
              {CONTENT_FORMATS.map((f) => (
                <button key={f} onClick={() => toggleItem(formats, f, setFormats)}
                  className={`px-2 py-0.5 text-[10px] rounded-full border ${
                    formats.includes(f) ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'border-neutral-800 text-neutral-500'
                  }`}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>Platform</label>
            <div className="flex flex-wrap gap-1">
              {PLATFORMS.map((p) => (
                <button key={p} onClick={() => toggleItem(platforms, p, setPlatforms)}
                  className={`px-2 py-0.5 text-[10px] rounded-full border ${
                    platforms.includes(p) ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'border-neutral-800 text-neutral-500'
                  }`}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Generate */}
        <div className="flex gap-2">
          <button onClick={() => handleGenerate('prompt')} disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-green-500 text-black font-semibold text-sm hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading && generateType === 'prompt' ? 'Generating...' : 'Generate'}
          </button>
          <button onClick={() => handleGenerate('hook-only')} disabled={loading}
            className="px-3 py-2.5 rounded-lg border border-neutral-700 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50">
            Hook Only
          </button>
        </div>

        {error && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
          <div className="inline-block w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-500 text-xs mt-2">Generating...</p>
        </div>
      )}

      {/* ===== OUTPUT SECTION ===== */}
      {result && (
        <div className="space-y-3">
          {/* Narration — editable */}
          {(narration || result.narration) && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
                <h3 className="text-xs font-semibold text-green-400">Narration Script</h3>
                <CopyBtn text={narration} />
              </div>
              <textarea
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                rows={6}
                className="w-full bg-transparent px-3 py-3 text-sm text-neutral-200 leading-relaxed resize-y focus:outline-none"
                style={{ minHeight: 100, WebkitOverflowScrolling: 'touch' }}
                placeholder="Paste or edit your narration script here..."
              />
            </div>
          )}

          {/* Full prompt output */}
          <OutputBlock title="Full Prompt" content={result.fullText} />

          {/* ===== SAVE / COPY — bottom of page after output ===== */}
          <div className="flex gap-2">
            <CopyBtn text={result.fullText} label="Copy All" block />
            <button onClick={handleSave}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                saveStatus === 'saved'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : saveStatus === 'saving'
                  ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  : 'bg-white/10 text-white border border-neutral-700 hover:bg-white/15'
              }`}
            >
              {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'saving' ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Save config even without generating */}
      {!result && !loading && (
        <button onClick={handleSave}
          className="w-full py-2 rounded-lg border border-neutral-800 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-700 transition-colors">
          Save Config
        </button>
      )}
    </div>
  );
}

// --- Shared components ---

function NavPill({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap flex-shrink-0 ${
        active ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
      }`}>{children}</Link>
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
        className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
          copied ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/10 text-white border border-neutral-700 hover:bg-white/15'
        }`}>{copied ? 'Copied!' : label || 'Copy'}</button>
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <h3 className="text-xs font-semibold text-neutral-300">{title}</h3>
        <CopyBtn text={content} />
      </div>
      <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: '70vh', WebkitOverflowScrolling: 'touch' }}>
        <pre className="px-3 py-3 text-xs text-neutral-300 font-mono whitespace-pre-wrap leading-relaxed">{content}</pre>
      </div>
    </div>
  );
}
