'use client';

import { useEffect, useState, useCallback } from 'react';

interface Step {
  sec: number;
  label: string;
  caption: string;
  effect: string;
}

interface VideoConfig {
  id: string;
  composition_id: string;
  title: string;
  recording_file: string;
  intro_title: string;
  intro_sec: number;
  video_sec: number;
  end_sec: number;
  title_card_duration_sec: number;
  caption_duration_sec: number;
  end_tagline: string;
  end_cta: string;
  steps: Step[];
  phone_width: number;
  phone_height: number;
  muted: boolean;
  is_active: boolean;
  updated_at: string;
}

const EFFECTS = [
  'slide-up-bounce',
  'slide-right-pulse',
  'scale-blur',
  'slide-left-parallax',
  'rotate-pulse',
  'slide-right-bounce',
  'zoom-glow',
];

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-neutral-500 bg-neutral-800/40 border border-neutral-800 rounded-lg px-3 py-2">
      <span className="text-[#00E676] shrink-0 mt-px">tip</span>
      <span>{children}</span>
    </div>
  );
}

function CopyBlock({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <p className="text-[10px] text-neutral-500 mb-1 font-medium uppercase tracking-wider">{label}</p>
      <button
        onClick={copy}
        className="w-full text-left bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-neutral-300 hover:border-neutral-600 transition-colors group relative"
      >
        <span className="break-all">{command}</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 group-hover:text-neutral-400 transition-colors">
          {copied ? 'copied' : 'click to copy'}
        </span>
      </button>
    </div>
  );
}

export default function AdminVideosPage() {
  const [configs, setConfigs] = useState<VideoConfig[]>([]);
  const [selected, setSelected] = useState<VideoConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [terminalLines, setTerminalLines] = useState<{ type: string; text: string }[]>([]);
  const [rendering, setRendering] = useState(false);
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const fetchConfigs = useCallback(async () => {
    const res = await fetch('/api/admin/videos');
    if (res.ok) setConfigs(await res.json());
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const createVideo = async () => {
    const compositionId = prompt(
      'Enter a Composition ID for this video.\n\n' +
      'Use PascalCase (e.g. RiderOnboarding, DriverEarnings).\n' +
      'This must match a registered Remotion composition in videos/src/Root.tsx.\n\n' +
      'Existing: ' + configs.map(c => c.composition_id).join(', ')
    );
    if (!compositionId || !compositionId.trim()) return;

    const cleanId = compositionId.trim();
    if (configs.some(c => c.composition_id === cleanId)) {
      showToast('A video with that Composition ID already exists');
      return;
    }

    setCreating(true);
    const res = await fetch('/api/admin/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compositionId: cleanId,
        title: 'New Video',
        recordingFile: 'recording.mp4',
        introTitle: cleanId.replace(/([A-Z])/g, ' $1').trim().toUpperCase(),
        videoSec: 60,
        steps: [
          { sec: 2, label: 'STEP ONE', caption: 'Description here.', effect: 'slide-up-bounce' },
        ],
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setConfigs(prev => [...prev, created]);
      setSelected(created);
      showToast(`Video "${cleanId}" created — add your recording and configure steps`);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to create');
    }
    setCreating(false);
  };

  const deleteVideo = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/videos/${selected.id}`, { method: 'DELETE' });
    if (res.ok) {
      setConfigs(prev => prev.filter(c => c.id !== selected.id));
      setSelected(null);
      showToast('Deleted');
    }
  };

  const runAction = async (action: 'render' | 'preview') => {
    if (!selected || rendering) return;
    setRendering(true);
    setTerminalLines([]);

    try {
      const res = await fetch(`/api/admin/videos/${selected.id}/render?action=${action}`, {
        method: 'POST',
      });

      // Non-streaming error response (auth, 404, 501, etc.)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setTerminalLines([{ type: 'error', text: err.error || `HTTP ${res.status}` }]);
        setRendering(false);
        return;
      }

      // Stream NDJSON lines
      const reader = res.body?.getReader();
      if (!reader) {
        setTerminalLines([{ type: 'error', text: 'No response stream' }]);
        setRendering(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            setTerminalLines(prev => [...prev, parsed]);
            if (parsed.type === 'done') {
              showToast(action === 'render' ? 'Render complete' : 'Studio started');
            }
          } catch {
            setTerminalLines(prev => [...prev, { type: 'stdout', text: line }]);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          setTerminalLines(prev => [...prev, parsed]);
        } catch {
          setTerminalLines(prev => [...prev, { type: 'stdout', text: buffer }]);
        }
      }
    } catch (err) {
      setTerminalLines(prev => [...prev, {
        type: 'error',
        text: err instanceof Error ? err.message : 'Request failed',
      }]);
    }

    setRendering(false);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/admin/videos/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compositionId: selected.composition_id,
        title: selected.title,
        recordingFile: selected.recording_file,
        introTitle: selected.intro_title,
        introSec: selected.intro_sec,
        videoSec: selected.video_sec,
        endSec: selected.end_sec,
        titleCardDurationSec: selected.title_card_duration_sec,
        captionDurationSec: selected.caption_duration_sec,
        endTagline: selected.end_tagline,
        endCta: selected.end_cta,
        steps: selected.steps,
        phoneWidth: selected.phone_width,
        phoneHeight: selected.phone_height,
        muted: selected.muted,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelected(updated);
      showToast('Saved');
    }
    setSaving(false);
  };

  const updateStep = (idx: number, field: keyof Step, value: string | number) => {
    if (!selected) return;
    const newSteps = [...selected.steps];
    newSteps[idx] = { ...newSteps[idx], [field]: value };
    setSelected({ ...selected, steps: newSteps });
  };

  const addStep = () => {
    if (!selected) return;
    const lastSec = selected.steps.length > 0
      ? selected.steps[selected.steps.length - 1].sec + 10
      : 0;
    setSelected({
      ...selected,
      steps: [
        ...selected.steps,
        { sec: lastSec, label: 'NEW STEP', caption: 'Description here.', effect: 'slide-up-bounce' },
      ],
    });
  };

  const removeStep = (idx: number) => {
    if (!selected) return;
    setSelected({
      ...selected,
      steps: selected.steps.filter((_, i) => i !== idx),
    });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    if (!selected) return;
    const newSteps = [...selected.steps];
    const target = idx + dir;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[idx], newSteps[target]] = [newSteps[target], newSteps[idx]];
    setSelected({ ...selected, steps: newSteps });
  };

  const outFileName = selected
    ? selected.composition_id.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1)
    : '';

  const totalDuration = selected
    ? Number(selected.intro_sec) + Number(selected.video_sec) + (selected.steps.length * Number(selected.title_card_duration_sec)) + Number(selected.end_sec)
    : 0;

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Videos</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Manage video compositions — edit timestamps, labels, and captions, then render locally.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#00E676] text-black px-4 py-2 rounded-lg text-sm font-bold shadow-lg animate-in fade-in">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Video list */}
        <div className="space-y-2">
          {configs.map(config => (
            <button
              key={config.id}
              onClick={() => setSelected(config)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                selected?.id === config.id
                  ? 'bg-white/10 border-[#00E676]/30'
                  : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">{config.title}</h3>
                {config.is_active && (
                  <span className="text-[9px] bg-[#00E676]/20 text-[#00E676] px-2 py-0.5 rounded-full font-bold">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {config.steps.length} steps &middot; {config.recording_file}
              </p>
              <p className="text-[10px] text-neutral-600 mt-1 font-mono">
                {config.composition_id}
              </p>
            </button>
          ))}
          <button
            onClick={createVideo}
            disabled={creating}
            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-colors border border-dashed border-neutral-700 text-neutral-400 hover:text-white disabled:opacity-50"
          >
            {creating ? 'Creating...' : '+ New Video'}
          </button>
        </div>

        {/* Editor */}
        {selected ? (
          <div className="space-y-6">
            {/* ── SECTION 1: Recording source ── */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-[#00E676] font-bold bg-[#00E676]/10 px-2 py-0.5 rounded">STEP 1</span>
                <h2 className="text-sm font-bold">Screen Recording</h2>
              </div>
              <p className="text-xs text-neutral-500 mb-4">
                Drop your .mp4 or .mov screen recording into the recordings folder, then set the filename and total duration below.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Field label="Title" value={selected.title} onChange={v => setSelected({ ...selected, title: v })} />
                <Field label="Composition ID" value={selected.composition_id} onChange={v => setSelected({ ...selected, composition_id: v })} />
                <Field label="Recording file" value={selected.recording_file} onChange={v => setSelected({ ...selected, recording_file: v })} />
                <Field label="Video length (sec)" value={String(selected.video_sec)} type="number" onChange={v => setSelected({ ...selected, video_sec: Number(v) })} />
              </div>

              <div className="mt-3">
                <CopyBlock
                  label="Place your file here"
                  command={`cp ~/your-recording.mp4 videos/public/recordings/${selected.recording_file}`}
                />
              </div>
            </div>

            {/* ── SECTION 2: Timestamps / Steps ── */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-[#00E676] font-bold bg-[#00E676]/10 px-2 py-0.5 rounded">STEP 2</span>
                <h3 className="text-sm font-bold">
                  Timestamp Labels
                  <span className="text-neutral-500 font-normal ml-2">
                    ({selected.steps.length})
                  </span>
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mb-4">
                Watch your raw recording and note the second each moment happens.
                Enter those exact timestamps below — the composition automatically shifts
                overlay positions and freezes the video during title cards so everything stays in sync.
              </p>

              <div className="space-y-3">
                {selected.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#00E676] font-bold bg-[#00E676]/10 px-2 py-0.5 rounded">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="text-xs text-neutral-500 font-mono">
                          @ {step.sec}s
                          <span className="text-neutral-600 ml-1">
                            ({Math.floor(step.sec / 60)}:{String(Math.round(step.sec % 60)).padStart(2, '0')})
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveStep(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-neutral-500 hover:text-white disabled:opacity-20 text-xs"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveStep(idx, 1)}
                          disabled={idx === selected.steps.length - 1}
                          className="p-1 text-neutral-500 hover:text-white disabled:opacity-20 text-xs"
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => removeStep(idx)}
                          className="p-1 text-red-400/50 hover:text-red-400 text-xs ml-2"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-[80px_1fr_1fr_160px] gap-3">
                      <div>
                        <label className="text-[10px] text-neutral-500 block mb-1">Time (s)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={step.sec}
                          onChange={e => updateStep(idx, 'sec', parseFloat(e.target.value) || 0)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-500 block mb-1">Label</label>
                        <input
                          type="text"
                          value={step.label}
                          onChange={e => updateStep(idx, 'label', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-500 block mb-1">Caption</label>
                        <input
                          type="text"
                          value={step.caption}
                          onChange={e => updateStep(idx, 'caption', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-500 block mb-1">Effect</label>
                        <select
                          value={step.effect}
                          onChange={e => updateStep(idx, 'effect', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm"
                        >
                          {EFFECTS.map(e => (
                            <option key={e} value={e}>{e}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addStep}
                className="mt-3 w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors border border-dashed border-neutral-700"
              >
                + Add step
              </button>
            </div>

            {/* ── Overlay timing + end card ── */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h3 className="text-sm font-bold mb-1">Overlay Timing &amp; End Card</h3>
              <p className="text-xs text-neutral-500 mb-4">
                How long each title card and caption stays on screen, plus the intro/end card text.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <Field label="Intro (sec)" value={String(selected.intro_sec)} type="number" onChange={v => setSelected({ ...selected, intro_sec: Number(v) })} />
                <Field label="Title card (sec)" value={String(selected.title_card_duration_sec)} type="number" onChange={v => setSelected({ ...selected, title_card_duration_sec: Number(v) })} />
                <Field label="Caption (sec)" value={String(selected.caption_duration_sec)} type="number" onChange={v => setSelected({ ...selected, caption_duration_sec: Number(v) })} />
                <Field label="End card (sec)" value={String(selected.end_sec)} type="number" onChange={v => setSelected({ ...selected, end_sec: Number(v) })} />
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-1 font-medium uppercase tracking-wider">Phone size</label>
                  <select
                    value={`${Number(selected.phone_width) || 480}x${Number(selected.phone_height) || 1036}`}
                    onChange={e => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      setSelected({ ...selected, phone_width: w, phone_height: h });
                    }}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="480x1036">Default (480 × 1036)</option>
                    <option value="540x1166">Prominent (540 × 1166)</option>
                    <option value="620x1340">Large (620 × 1340)</option>
                    <option value="700x1512">Full (700 × 1512)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-neutral-800">
                <Field label="Intro title" value={selected.intro_title} onChange={v => setSelected({ ...selected, intro_title: v })} />
                <Field label="End tagline" value={selected.end_tagline} onChange={v => setSelected({ ...selected, end_tagline: v })} />
                <Field label="End CTA" value={selected.end_cta} onChange={v => setSelected({ ...selected, end_cta: v })} />
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setSelected({ ...selected, muted: !selected.muted })}
                    className="relative"
                    style={{
                      width: 40, height: 22, borderRadius: 11,
                      background: selected.muted ? 'rgba(255,82,82,0.3)' : 'rgba(0,230,118,0.3)',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, width: 18, height: 18, borderRadius: 9,
                      background: selected.muted ? '#FF5252' : '#00E676',
                      left: selected.muted ? 20 : 2,
                      transition: 'left 0.2s, background 0.2s',
                    }} />
                  </div>
                  <div>
                    <span className="text-sm font-medium">{selected.muted ? 'Audio muted' : 'Audio on'}</span>
                    <p className="text-[10px] text-neutral-500">
                      {selected.muted
                        ? 'Recording audio will be stripped from the rendered video.'
                        : 'Recording audio will be included in the rendered video.'}
                    </p>
                  </div>
                </label>
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-800 flex items-center gap-4">
                <div>
                  <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Total duration</p>
                  <p className="text-lg font-bold text-[#00E676] font-mono">
                    {Math.floor(totalDuration / 60)}:{String(Math.round(totalDuration % 60)).padStart(2, '0')}
                  </p>
                </div>
                <p className="text-[10px] text-neutral-600">
                  = {Number(selected.intro_sec)}s intro + {Number(selected.video_sec)}s video + {selected.steps.length} &times; {Number(selected.title_card_duration_sec)}s cards + {Number(selected.end_sec)}s end
                </p>
              </div>
            </div>

            {/* ── SAVE ── */}
            <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <p className="text-xs text-neutral-500">
                  Last saved: {new Date(selected.updated_at).toLocaleString()}
                </p>
                <button
                  onClick={deleteVideo}
                  className="text-[11px] text-red-400/50 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
              <button
                onClick={save}
                disabled={saving}
                className="px-6 py-2.5 bg-[#00E676] text-black font-bold rounded-lg text-sm hover:bg-[#00E676]/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            {/* ── SECTION 3: Preview & Render ── */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-[#00E676] font-bold bg-[#00E676]/10 px-2 py-0.5 rounded">STEP 3</span>
                <h3 className="text-sm font-bold">Preview &amp; Render</h3>
              </div>
              <p className="text-xs text-neutral-500 mb-4">
                Preview in Remotion Studio to check timing, then render the final MP4. Both run locally via your terminal.
              </p>

              {isLocal ? (
                <>
                  <div className="flex gap-3 mb-4">
                    <button
                      onClick={() => runAction('preview')}
                      disabled={rendering}
                      className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-neutral-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {rendering ? 'Running...' : 'Open Remotion Studio'}
                    </button>
                    <button
                      onClick={() => runAction('render')}
                      disabled={rendering}
                      className="flex-1 py-2.5 bg-[#00E676] hover:bg-[#00E676]/90 text-black font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {rendering ? 'Rendering...' : `Render ${selected.composition_id}`}
                    </button>
                  </div>
                  <Hint>
                    These buttons run Remotion commands on your local machine via the dev server.
                    Output will appear below. The rendered file lands in <code className="bg-neutral-800 px-1 rounded text-[10px]">videos/out/{outFileName}.mp4</code>
                  </Hint>
                </>
              ) : (
                <div className="mb-4 space-y-3">
                  <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4">
                    <p className="text-xs font-medium text-white mb-3">Rendering runs locally via your terminal. Open a terminal and run:</p>
                    <div className="space-y-2">
                      <CopyBlock
                        label="Clear Remotion cache (run first if changes aren't showing)"
                        command="rm -rf videos/.cache videos/node_modules/.cache"
                      />
                      <CopyBlock
                        label="Preview in Remotion Studio"
                        command={`npm run video -- preview ${selected.composition_id}`}
                      />
                      <CopyBlock
                        label="Render to MP4"
                        command={`npm run video -- render ${selected.composition_id}`}
                      />
                      <CopyBlock
                        label="List all videos"
                        command="npm run video -- list"
                      />
                    </div>
                    <p className="text-[10px] text-neutral-600 mt-3">
                      Output: <code className="bg-neutral-800 px-1 rounded">videos/out/{outFileName}.mp4</code>
                    </p>
                  </div>
                </div>
              )}

              {/* Terminal output */}
              {terminalLines.length > 0 && (
                <div className="mt-4 bg-black border border-neutral-800 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/80 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                        <div className={`w-2.5 h-2.5 rounded-full ${rendering ? 'bg-green-500 animate-pulse' : 'bg-green-500/60'}`} />
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {rendering ? 'running...' : 'done'}
                      </span>
                    </div>
                    <button
                      onClick={() => setTerminalLines([])}
                      className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
                    >
                      clear
                    </button>
                  </div>
                  <div className="p-3 max-h-80 overflow-y-auto font-mono text-xs space-y-0.5">
                    {terminalLines.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.type === 'error' ? 'text-red-400' :
                          line.type === 'done' ? 'text-[#00E676] font-bold' :
                          line.type === 'status' ? 'text-blue-400' :
                          line.type === 'stderr' ? 'text-yellow-400/80' :
                          'text-neutral-300'
                        }
                      >
                        {line.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-2">
                <p className="text-[10px] text-neutral-600">Or run manually:</p>
                <CopyBlock label="Clear Remotion cache" command="rm -rf videos/.cache videos/node_modules/.cache" />
                <CopyBlock label="Preview" command={`npm run video -- preview ${selected.composition_id}`} />
                <CopyBlock label="Render" command={`npm run video -- render ${selected.composition_id}`} />
              </div>
            </div>

            {/* ── SECTION 5: Upload ── */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-[#00E676] font-bold bg-[#00E676]/10 px-2 py-0.5 rounded">STEP 5</span>
                <h3 className="text-sm font-bold">Upload</h3>
              </div>
              <p className="text-xs text-neutral-500 mb-3">
                Move the rendered MP4 to where you need it.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3">
                  <p className="text-xs font-medium mb-1">Investor Data Room</p>
                  <p className="text-[11px] text-neutral-500 mb-2">
                    Upload via Admin &rarr; Data Room &rarr; Documents
                  </p>
                  <a
                    href="/admin/data-room"
                    className="text-[11px] text-[#00E676] hover:underline"
                  >
                    Go to Data Room &rarr;
                  </a>
                </div>
                <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3">
                  <p className="text-xs font-medium mb-1">Public Demo Page</p>
                  <p className="text-[11px] text-neutral-500 mb-2">
                    Copy the MP4 into the public pitch folder
                  </p>
                  <CopyBlock
                    label=""
                    command={`cp videos/out/${outFileName}.mp4 public/pitch/`}
                  />
                </div>
                <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3">
                  <p className="text-xs font-medium mb-1">View Public Pitch</p>
                  <p className="text-[11px] text-neutral-500 mb-2">
                    Verify your videos are visible on the live pitch page
                  </p>
                  <a
                    href="/pitch"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#00E676] hover:underline"
                  >
                    Open /pitch &rarr;
                  </a>
                  <p className="text-[10px] text-neutral-600 mt-1">
                    atl.hmucashride.com/pitch
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-600 text-sm gap-2">
            <span className="text-2xl">&#127909;</span>
            Select a video to edit its timestamps and render settings
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-neutral-500 block mb-1 font-medium uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        step={type === 'number' ? '0.1' : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}
