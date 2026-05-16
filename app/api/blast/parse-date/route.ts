// POST /api/blast/parse-date — server side of the blast form's NLP date parser.
//
// Free-text in ("tonight 8pm", "next wednesday at 9"), structured JSON out:
//   { scheduledFor: ISO8601 string | null, confidence: 0..1 }
//
// The client (lib/blast/date-parser.OpenAIParser) treats confidence < 0.9 as
// "show the chip picker" per the contract. Server timeouts and 4xx/5xx are
// also treated as fallback by the client — we don't need to be lenient here,
// just consistent.
//
// Auth: anonymous — riders use the form pre-signup. Rate-limited per IP since
// every call costs OpenAI tokens. The blast form debounces 400ms before
// firing, so the practical call rate is low.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit/check';

export const runtime = 'nodejs';

interface ParseBody {
  text?: unknown;
  nowIso?: unknown;
  tzOffsetMinutes?: unknown;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  return 'unknown';
}

// Hard server timeout for the OpenAI call. The client gives itself 1500ms;
// we go slightly tighter so a slow LLM round-trip doesn't burn the client's
// budget before we get a chance to respond with a fallback.
const OPENAI_TIMEOUT_MS = 1200;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit({
    key: `blast:parse-date:${clientIp(req)}`,
    limit: 60,
    windowSeconds: 3600,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as ParseBody;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const nowIso = typeof body.nowIso === 'string' ? body.nowIso : new Date().toISOString();
  const tzOffsetMinutes =
    typeof body.tzOffsetMinutes === 'number' ? body.tzOffsetMinutes : 0;

  if (text.length < 2 || text.length > 200) {
    // Below the minimum useful length or absurdly long — don't spend tokens.
    // Client treats null + 0 as "show chips" which is the right outcome.
    return NextResponse.json({ scheduledFor: null, confidence: 0 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Mis-configured environment — degrade to chips rather than 500. The
    // client form stays usable; admin can see the gap in logs.
    console.warn('parse-date: OPENAI_API_KEY missing — degrading to chip-only');
    return NextResponse.json({ scheduledFor: null, confidence: 0 });
  }

  // Convert the client's tzOffsetMinutes to an IANA-style "UTC±HH:MM" tag the
  // LLM can anchor to. JS getTimezoneOffset returns minutes *behind* UTC, so
  // a US Eastern client (UTC-4) yields +240; we negate so the prompt label
  // says "UTC-04:00".
  const offsetSign = tzOffsetMinutes <= 0 ? '+' : '-';
  const absMin = Math.abs(tzOffsetMinutes);
  const offsetHH = String(Math.floor(absMin / 60)).padStart(2, '0');
  const offsetMM = String(absMin % 60).padStart(2, '0');
  const tzLabel = `UTC${offsetSign}${offsetHH}:${offsetMM}`;

  const systemPrompt = [
    'You parse short, informal English date/time phrases into a single absolute ISO 8601 timestamp.',
    'You receive the user\'s current local "now" and timezone. Resolve relative phrases ("tonight", "tomorrow morning", "in an hour", "this friday at 8") against that anchor.',
    'You MUST output strict JSON with exactly two keys:',
    '  "scheduledFor": ISO 8601 string with offset, or null if the input is not parseable as a future time',
    '  "confidence":   number in [0, 1] — 0.9+ only when you\'re sure',
    'If the phrase resolves to a time in the past, return scheduledFor: null and confidence: 0.',
    'Never guess at vague phrases like "soon" or "later" — return null with low confidence.',
    'Never explain. Never add fields. Output JSON only.',
  ].join('\n');

  const userPrompt = [
    `User now: ${nowIso} (${tzLabel})`,
    `Phrase: "${text.replace(/"/g, '\\"')}"`,
  ].join('\n');

  // AbortController gives us a hard ceiling on the OpenAI round-trip so a
  // slow API call can't tie up Cloudflare's request budget.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 80,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 4xx/5xx from OpenAI — log for admin visibility, return fallback.
      const errBody = await res.text().catch(() => '');
      console.warn('parse-date: OpenAI non-OK', res.status, errBody.slice(0, 200));
      return NextResponse.json({ scheduledFor: null, confidence: 0 });
    }

    const completion = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const raw = completion?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      return NextResponse.json({ scheduledFor: null, confidence: 0 });
    }

    let parsed: { scheduledFor?: unknown; confidence?: unknown } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('parse-date: LLM returned non-JSON', raw.slice(0, 200));
      return NextResponse.json({ scheduledFor: null, confidence: 0 });
    }

    const scheduledFor =
      parsed.scheduledFor === null
        ? null
        : typeof parsed.scheduledFor === 'string'
          ? parsed.scheduledFor
          : null;
    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;

    // Validate the ISO actually resolves to a real Date — a hallucinated
    // "2026-02-30" would otherwise become an invalid Date the form would
    // happily save into the draft.
    if (scheduledFor) {
      const t = new Date(scheduledFor).getTime();
      if (!Number.isFinite(t)) {
        return NextResponse.json({ scheduledFor: null, confidence: 0 });
      }
    }

    return NextResponse.json({ scheduledFor, confidence });
  } catch (err) {
    // AbortError (timeout), network error — degrade to chips.
    const aborted = err instanceof Error && err.name === 'AbortError';
    if (!aborted) {
      console.warn('parse-date: unexpected error', err);
    }
    return NextResponse.json({ scheduledFor: null, confidence: 0 });
  } finally {
    clearTimeout(timeoutId);
  }
}
