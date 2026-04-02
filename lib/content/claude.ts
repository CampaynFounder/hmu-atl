// Claude API integration for HMU CashRide Video Content Engine
// Uses raw fetch (Cloudflare Workers compatible) — matches existing OpenAI pattern

import {
  HOOK_ARCHETYPES,
  AUDIENCE_SEGMENTS,
  PAIN_MATRIX,
  TEMPO_MAPS,
  PSYCH_FRAMEWORKS,
  TREND_TYPES,
  CTA_BANK,
  ENERGY_LEVELS,
} from './framework';

export interface GenerateRequest {
  type: 'prompt' | 'trend-hijack' | 'hook-only';
  segment: string;
  hook: string;
  tempo: number;
  song: string;
  painPoint: string;
  proofPoint: string;
  format: string[];
  platform: string[];
  // Trend hijack fields
  trendDescription?: string;
  trendType?: string;
  trendSound?: string;
  energy?: string;
}

export interface GenerateResponse {
  fullText: string;
  geminiPrompt: string;
  timingSheet: string;
  hookText: string;
}

function buildSystemPrompt(): string {
  const hooks = HOOK_ARCHETYPES.map(
    (h) =>
      `${h.number} — ${h.name}: ${h.title}\nPsychology: ${h.psychology}\nVisual: ${h.visual}\nVO: ${h.vo}\nText: ${h.text}\nPrompt instruction: ${h.promptInstruction}`
  ).join('\n\n');

  const segments = AUDIENCE_SEGMENTS.map(
    (s) =>
      `${s.badge} — ${s.label}\nAvatar: ${s.avatar}\nDefault pain: ${s.painDefault}\nDefault proof: ${s.proofDefault}\nEnvironment: ${s.environment}`
  ).join('\n\n');

  const pains = PAIN_MATRIX.map(
    (p) => `${p.badge} ${p.name}: ${p.description}\nSolution: ${p.solution}\nStat: ${p.stat}`
  ).join('\n\n');

  const tempos = TEMPO_MAPS.map(
    (t) =>
      `${t.name} (${t.bpm} BPM): Bar = ~${t.barLength}s, ${t.cutsPerThirty} cuts/30s, max ${t.maxWords} words/line\nFeel: ${t.feel}\nBest for: ${t.bestFor}\nTiming map:\n${t.timingMap}`
  ).join('\n\n');

  const psych = PSYCH_FRAMEWORKS.map(
    (p) =>
      `${p.id}. ${p.name} (${p.author})\nPrinciple: ${p.principle}\nApplication: ${p.application}\nPrompt instruction: ${p.promptInstruction}`
  ).join('\n\n');

  const ctas = CTA_BANK.map(
    (c) => `${c.name}: ${c.ctas.join(' | ')}`
  ).join('\n');

  return `You are the HMU CashRide Video Content Engine — an AI creative director that generates music-grounded, psychologically-driven video content prompts for marketing HMU CashRide on TikTok, FB Reels, IG Reels, and YouTube Shorts.

HMU CashRide is a peer-to-peer ride platform for Metro Atlanta. Key value props:
- Drivers keep 90% on their first $50/day (progressive fees, capped at $40/day max)
- No deactivation — drivers own their business and their riders
- Set your own price — riders see it upfront, no algorithm manipulation
- Escrow payment — money held before the driver moves
- Video-verified riders, full dispute resolution
- Built BY Atlanta, FOR Atlanta

THE H.M.U. FRAMEWORK (Hook -> Music -> Urgency):
Every piece of content uses this 3-layer system:
H — Hook Layer (0-3s): Pattern interrupt before the scroll continues
M — Music Sync (full duration): Tempo drives every cut, text reveal, and emotional beat
U — Urgency Close (final 5s): Loss-framed CTA with friction removal

=== 8 HOOK ARCHETYPES ===
${hooks}

=== AUDIENCE SEGMENTS ===
${segments}

=== PAIN MATRIX (6 emotional triggers) ===
${pains}

=== TEMPO MAPS ===
${tempos}

=== PSYCHOLOGICAL FRAMEWORKS ===
${psych}

=== CTA BANK ===
${ctas}

=== PRODUCTION RULES ===
- Format: 9:16 portrait, 1080x1920, 30 seconds
- No cuts mid-phrase. All cuts on musical beats only.
- Captions: high contrast, 40pt minimum, 15% safe zone from edges.
- First 3 seconds: NO logo, NO brand name — hook only.
- Aesthetic: UGC-authentic, not corporate. Car interiors, real streets, phone screens.
- Atlanta-specific: show recognizable landmarks, neighborhoods, or cultural cues.
- Loop: frame at 0:29 must match frame at 0:00. Audio loops at 30s.
- Every CTA frames inaction as loss, not the offer as gain.

When generating content, output these sections clearly separated:

1. **GEMINI VIDEO PROMPT** — A complete, copy-paste-ready prompt for Google Gemini to generate the video visual. Include format specs, music anchor, scene map with timestamps, and production notes.

2. **BEAT-LOCKED TIMING SHEET** — A table with timestamps, elements, durations, and notes for assembling in TikTok/CapCut. Include text overlay copy.

3. **HOOK + CAPTION** — The hook text, full social media caption with hashtags, comment seeder, and DM reply template.

Use the framework data above as your creative constraint. The user provides the variables — you generate the content using the framework.`;
}

function buildTrendSystemPrompt(): string {
  const base = buildSystemPrompt();

  const trends = TREND_TYPES.map(
    (t) =>
      `${t.badge} ${t.name}: ${t.description}\nStrategy: ${t.strategy}\nHook rec: ${t.hookRec}\nVelocity: ${t.velocity}`
  ).join('\n\n');

  return `${base}

=== TREND HIJACK SYSTEM ===
Viral trends give you free distribution. Your framework gives you conversion.
The Trend Hijack system maps any trending moment onto your H.M.U. framework.

Rule: The trend is the FORMAT. HMU CashRide is the CONTENT. Never force-fit.

TREND TYPES:
${trends}

THE TREND-TO-BRAND BRIDGE FORMULA:
TREND (format/sound/moment) + PAIN POINT (one of 6 triggers) + FRAMEWORK HOOK (matching archetype)

Bridge test:
1. Would someone scrolling recognize the trend format in the first second?
2. Does the pain point feel natural inside this format, or forced?
3. Can you deliver the HMU value prop without breaking the trend's rhythm?
If any answer is no, say so and suggest skipping this trend.

VELOCITY RULES:
- News moments: post within 24 hours
- Trending sounds: post within 3 days
- Format trends: post within 1-2 weeks
- Memes: evergreen

For trend hijacks, output these sections:
1. **TREND ANALYSIS** — Classification, velocity, bridge mapping
2. **HIJACK STRATEGY** — Which hooks to use, how to bridge
3. **GEMINI VIDEO PROMPT** — Trend-adapted scene map
4. **CAPTION + SEEDING** — Caption, first comment, FB group seeding strategy`;
}

function buildUserMessage(input: GenerateRequest): string {
  const segment = AUDIENCE_SEGMENTS.find((s) => s.id === input.segment);
  const hook = HOOK_ARCHETYPES.find((h) => h.id === input.hook);
  const tempo = TEMPO_MAPS.find((t) => t.bpm === input.tempo);

  if (input.type === 'trend-hijack') {
    const pain = PAIN_MATRIX.find((p) => p.id === input.painPoint) || PAIN_MATRIX[0];
    const energyInfo = ENERGY_LEVELS.find((e) => e.id === input.energy) || ENERGY_LEVELS[0];
    const trendType = TREND_TYPES.find((t) => t.id === input.trendType) || TREND_TYPES[0];

    return `Generate a TREND HIJACK prompt with these inputs:

TREND SPOTTED: ${input.trendDescription || '[No trend description provided]'}
TREND TYPE: ${trendType.name}
TRENDING SOUND: ${input.trendSound || '[No specific sound]'}
ENERGY LEVEL: ${energyInfo.label} (~${energyInfo.bpm} BPM, ${energyInfo.cuts} cuts/30s)
PAIN POINT: ${pain.badge} ${pain.name} — "${pain.description}"
SOLUTION: ${pain.solution}
PROOF STAT: ${pain.stat}
TARGET SEGMENT: ${segment?.label || 'All segments'}
PLATFORMS: ${input.platform.join(', ') || 'TikTok, FB Reels'}

Generate the full trend hijack output with all 4 sections.`;
  }

  if (input.type === 'hook-only') {
    return `Generate HOOK + CAPTION TEXT ONLY (no video prompt, no timing sheet) with these inputs:

AUDIENCE SEGMENT: ${segment?.label || 'Frustrated Platform Driver'}
HOOK ARCHETYPE: ${hook?.number || '01'} — ${hook?.name || 'The Receipt Reveal'}
PAIN POINT: ${input.painPoint || segment?.painDefault || 'Uber takes 40-50% of what the rider pays.'}
PROOF POINT: ${input.proofPoint || segment?.proofDefault || 'Keep 90% on HMU.'}
PLATFORMS: ${input.platform.join(', ') || 'TikTok'}

Generate:
1. Video hook (first 3 seconds — visual, VO, text overlay)
2. Full social media caption with hashtags
3. 3 alternate hook angles (same archetype, different wording)
4. Comment seeder (first comment to post)
5. DM reply template`;
  }

  // Full prompt generation
  return `Generate a complete VIDEO CONTENT PROMPT with these inputs:

AUDIENCE SEGMENT: ${segment?.label || 'Frustrated Platform Driver'} — ${segment?.avatar || ''}
HOOK ARCHETYPE: ${hook?.number || '01'} — ${hook?.name || 'The Receipt Reveal'}
TEMPO: ${tempo?.name || 'Energetic'} (${input.tempo} BPM, bar = ~${tempo?.barLength || 1.875}s, ${tempo?.cutsPerThirty || '8-12'} cuts/30s, max ${tempo?.maxWords || '12-14'} words/VO line)
SONG/MUSIC: ${input.song || '[Choose a trending song at this BPM]'}
PAIN POINT: ${input.painPoint || segment?.painDefault || 'Uber takes 40-50% of what the rider pays.'}
PROOF POINT: ${input.proofPoint || segment?.proofDefault || 'Keep 90% on HMU.'}
CONTENT FORMAT: ${input.format.join(', ') || 'AI-generated (Gemini)'}
PLATFORMS: ${input.platform.join(', ') || 'TikTok'}
ENVIRONMENT: ${segment?.environment || 'car interior, phone screens, Atlanta streets'}

Hook instruction: ${hook?.promptInstruction || ''}

Generate all 3 sections: Gemini Video Prompt, Beat-Locked Timing Sheet, and Hook + Caption.`;
}

export async function generateContent(input: GenerateRequest): Promise<GenerateResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemPrompt =
    input.type === 'trend-hijack' ? buildTrendSystemPrompt() : buildSystemPrompt();
  const userMessage = buildUserMessage(input);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const fullText = data.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  // Split into sections by common heading patterns, but always keep fullText
  const sections = splitSections(fullText);

  return {
    fullText,
    geminiPrompt: sections.gemini || '',
    timingSheet: sections.timing || '',
    hookText: sections.hook || '',
  };
}

function splitSections(text: string): { gemini: string; timing: string; hook: string } {
  // Try splitting by markdown ## headings or **bold** headings
  // Look for section boundaries
  const sectionBreaks = [
    /^#{1,3}\s+/m,
    /^\*\*\d\./m,
    /^---+$/m,
  ];

  // Try to find the 3 expected sections by keyword
  const geminiStart = findSectionStart(text, ['gemini', 'video prompt', 'scene map']);
  const timingStart = findSectionStart(text, ['timing sheet', 'beat-locked', 'timestamp']);
  const hookStart = findSectionStart(text, ['hook', 'caption', 'hashtag']);

  // Sort by position
  const markers = [
    { key: 'gemini' as const, pos: geminiStart },
    { key: 'timing' as const, pos: timingStart },
    { key: 'hook' as const, pos: hookStart },
  ].filter(m => m.pos >= 0).sort((a, b) => a.pos - b.pos);

  const result = { gemini: '', timing: '', hook: '' };

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].pos;
    const end = i + 1 < markers.length ? markers[i + 1].pos : text.length;
    result[markers[i].key] = text.slice(start, end).trim();
  }

  // If we couldn't split, put everything in gemini
  if (!result.gemini && !result.timing && !result.hook) {
    result.gemini = text;
  }

  return result;
}

function findSectionStart(text: string, keywords: string[]): number {
  // Look for a heading line containing one of the keywords
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const isHeading = line.startsWith('#') || line.startsWith('**') || line.startsWith('===');
    if (isHeading) {
      for (const kw of keywords) {
        if (line.includes(kw.toLowerCase())) {
          // Return the character offset
          return lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
        }
      }
    }
  }
  return -1;
}
