'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  HOOK_ARCHETYPES,
  AUDIENCE_SEGMENTS,
  TEMPO_MAPS,
  CONTENT_FORMATS,
  PLATFORMS,
} from '@/lib/content/framework';

export default function ContentGeneratorPage() {
  const searchParams = useSearchParams();
  const [segment, setSegment] = useState(searchParams.get('segment') || 'frustrated');
  const [hook, setHook] = useState(searchParams.get('hook') || 'receipt');
  const [tempo, setTempo] = useState(Number(searchParams.get('tempo')) || 128);
  const [song, setSong] = useState('');
  const [painPoint, setPainPoint] = useState('');
  const [proofPoint, setProofPoint] = useState('');
  const [formats, setFormats] = useState<string[]>(['AI-generated (Gemini)']);
  const [platforms, setPlatforms] = useState<string[]>(['TikTok']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    geminiPrompt: string;
    timingSheet: string;
    hookText: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [generateType, setGenerateType] = useState<'prompt' | 'hook-only'>('prompt');

  const selectedSegment = AUDIENCE_SEGMENTS.find((s) => s.id === segment);

  async function handleGenerate(type: 'prompt' | 'hook-only') {
    setLoading(true);
    setError('');
    setResult(null);
    setGenerateType(type);

    try {
      const res = await fetch('/api/admin/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          segment,
          hook,
          tempo,
          song,
          painPoint: painPoint || selectedSegment?.painDefault || '',
          proofPoint: proofPoint || selectedSegment?.proofDefault || '',
          format: formats,
          platform: platforms,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(arr: string[], item: string, setter: (v: string[]) => void) {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="space-y-6">
      {/* Header + sub-nav */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Engine</h1>
        <p className="text-sm text-neutral-400 mt-1">
          AI-powered video content prompts for TikTok, FB Reels, IG
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin/content"
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white"
        >
          Prompt Builder
        </Link>
        <Link
          href="/admin/content/trends"
          className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"
        >
          Trend Hijack
        </Link>
        <Link
          href="/admin/content/calendar"
          className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"
        >
          Calendar
        </Link>
        <Link
          href="/admin/content/reference"
          className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"
        >
          Reference
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr,1fr] gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-neutral-300">Build Your Video Content</h2>

            {/* Audience Segment */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Audience Segment</label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                {AUDIENCE_SEGMENTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.badge} — {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Hook Archetype */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Hook Archetype</label>
              <select
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                {HOOK_ARCHETYPES.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.number} — {h.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tempo */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Tempo (BPM)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value) || 128)}
                  placeholder="128"
                  min={40}
                  max={200}
                  className="w-24 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
                />
                <div className="flex gap-1.5">
                  {TEMPO_MAPS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTempo(t.bpm)}
                      className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                        tempo === t.bpm
                          ? 'border-green-500 bg-green-500/10 text-white'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {t.bpm} {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Song */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Song Title or Music Description
              </label>
              <input
                type="text"
                value={song}
                onChange={(e) => setSong(e.target.value)}
                placeholder="e.g. 'Money Trees' by Kendrick Lamar"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
              />
            </div>

            {/* Pain Point */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Pain Point{' '}
                <span className="text-neutral-600">
                  (default: {selectedSegment?.painDefault?.slice(0, 50)}...)
                </span>
              </label>
              <input
                type="text"
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                placeholder={selectedSegment?.painDefault}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
              />
            </div>

            {/* Proof Point */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Proof Point (optional)
              </label>
              <input
                type="text"
                value={proofPoint}
                onChange={(e) => setProofPoint(e.target.value)}
                placeholder={selectedSegment?.proofDefault}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
              />
            </div>

            {/* Content Format */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Content Format</label>
              <div className="flex flex-wrap gap-2">
                {CONTENT_FORMATS.map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleItem(formats, f, setFormats)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      formats.includes(f)
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Platform</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => toggleItem(platforms, p, setPlatforms)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      platforms.includes(p)
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleGenerate('prompt')}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-green-500 text-black font-semibold text-sm hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading && generateType === 'prompt' ? 'Generating...' : 'Generate Full Prompt'}
              </button>
              <button
                onClick={() => handleGenerate('hook-only')}
                disabled={loading}
                className="px-4 py-2.5 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                {loading && generateType === 'hook-only' ? '...' : 'Hook Only'}
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Output */}
        <div className="space-y-4">
          {!result && !loading && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
              <p className="text-neutral-500 text-sm">
                Configure your inputs and hit Generate to create AI-powered video content prompts.
              </p>
            </div>
          )}

          {loading && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
              <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-neutral-400 text-sm mt-3">
                Claude is generating your content...
              </p>
            </div>
          )}

          {result?.geminiPrompt && (
            <OutputBlock
              title="Gemini Video Prompt"
              content={result.geminiPrompt}
              onCopy={() => copyToClipboard(result.geminiPrompt)}
            />
          )}

          {result?.timingSheet && (
            <OutputBlock
              title="Beat-Locked Timing Sheet"
              content={result.timingSheet}
              onCopy={() => copyToClipboard(result.timingSheet)}
            />
          )}

          {result?.hookText && (
            <OutputBlock
              title="Hook + Caption"
              content={result.hookText}
              onCopy={() => copyToClipboard(result.hookText)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function OutputBlock({
  title,
  content,
  onCopy,
}: {
  title: string;
  content: string;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <h3 className="text-xs font-semibold text-neutral-300">{title}</h3>
        <button
          onClick={handleCopy}
          className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs text-neutral-300 font-mono whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed">
        {content}
      </pre>
    </div>
  );
}
