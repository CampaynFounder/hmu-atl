'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AUDIENCE_SEGMENTS,
  PAIN_MATRIX,
  TREND_TYPES,
  ENERGY_LEVELS,
  PLATFORMS,
} from '@/lib/content/framework';

export default function TrendHijackPage() {
  const [trendDescription, setTrendDescription] = useState('');
  const [trendType, setTrendType] = useState('sound');
  const [trendSound, setTrendSound] = useState('');
  const [painPoint, setPainPoint] = useState('p1');
  const [segment, setSegment] = useState('frustrated');
  const [energy, setEnergy] = useState('high');
  const [platforms, setPlatforms] = useState<string[]>(['TikTok', 'FB Reels']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    geminiPrompt: string;
    timingSheet: string;
    hookText: string;
    caption: string;
    commentSeeder: string;
    dmReply: string;
  } | null>(null);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/admin/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trend-hijack',
          segment,
          hook: 'receipt',
          tempo: 128,
          song: trendSound || '',
          painPoint,
          proofPoint: '',
          format: [],
          platform: platforms,
          trendDescription,
          trendType,
          trendSound,
          energy,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Engine</h1>
        <p className="text-sm text-neutral-400 mt-1">Ride the wave, plant the flag</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/admin/content" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Prompt Builder</Link>
        <Link href="/admin/content/trends" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white">Trend Hijack</Link>
        <Link href="/admin/content/calendar" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Calendar</Link>
        <Link href="/admin/content/reference" className="px-3 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">Reference</Link>
      </div>

      <div className="grid lg:grid-cols-[1fr,1fr] gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-neutral-300">Trend Hijack Generator</h2>

            {/* Trend Description */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Describe the trend (what you saw, where, what makes it viral)
              </label>
              <textarea
                value={trendDescription}
                onChange={(e) => setTrendDescription(e.target.value)}
                placeholder="e.g. 'POV: you just found out...' format on TikTok — creator stares at camera, then reveals surprising info..."
                rows={3}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 resize-y"
              />
            </div>

            {/* Trend Type */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Trend Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TREND_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTrendType(t.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      trendType === t.id
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">{t.badge} {t.name}</div>
                    <div className="text-[10px] text-neutral-500 mt-1 line-clamp-2">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Trending Sound */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Trending Sound (if applicable)</label>
              <input
                type="text"
                value={trendSound}
                onChange={(e) => setTrendSound(e.target.value)}
                placeholder="e.g. 'original sound — @user' or 'dramatic piano reveal'"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
              />
            </div>

            {/* Pain Point */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Pain Point Mapping</label>
              <select
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                {PAIN_MATRIX.map((p) => (
                  <option key={p.id} value={p.id}>{p.badge} — {p.name}</option>
                ))}
              </select>
            </div>

            {/* Segment */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Audience Segment</label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                {AUDIENCE_SEGMENTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Energy Level */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Energy Level</label>
              <div className="flex flex-wrap gap-2">
                {ENERGY_LEVELS.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setEnergy(e.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      energy === e.id
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platforms */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Platform</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPlatforms(
                        platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p]
                      );
                    }}
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

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-green-500 text-black font-semibold text-sm hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating Trend Hijack...' : 'Generate Trend Hijack Prompt'}
            </button>

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
                Spot a trend, fill in the details, and generate a hijack prompt.
              </p>
              <div className="mt-4 text-left space-y-2">
                {TREND_TYPES.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 text-xs">
                    <span className="text-green-500 font-bold mt-0.5">{t.badge}</span>
                    <div>
                      <span className="text-neutral-300 font-medium">{t.name}</span>
                      <span className="text-neutral-500"> — {t.velocity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
              <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-neutral-400 text-sm mt-3">Claude is generating your trend hijack...</p>
            </div>
          )}

          {result && (
            <>
              {result.geminiPrompt && (
                <OutputBlock title="Trend Hijack Prompt" content={result.geminiPrompt} onCopy={() => copyToClipboard(result.geminiPrompt)} />
              )}
              {result.timingSheet && (
                <OutputBlock title="Trend Analysis" content={result.timingSheet} onCopy={() => copyToClipboard(result.timingSheet)} />
              )}
              {result.hookText && (
                <OutputBlock title="Hijack Strategy" content={result.hookText} onCopy={() => copyToClipboard(result.hookText)} />
              )}
              {result.caption && (
                <OutputBlock title="Caption + Seeding" content={result.caption} onCopy={() => copyToClipboard(result.caption)} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OutputBlock({ title, content, onCopy }: { title: string; content: string; onCopy: () => void }) {
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
        <button onClick={handleCopy} className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-white transition-colors">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs text-neutral-300 font-mono whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed">{content}</pre>
    </div>
  );
}
