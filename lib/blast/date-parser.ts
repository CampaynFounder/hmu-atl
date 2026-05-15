// Blast NLP date parser.
//
// Per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-4 + §6.6:
//   - User types free text ("next Wednesday at 8pm", "tomorrow morning")
//   - LLM (gpt-4o-mini, structured JSON output, 1.5s timeout) tries to parse
//   - On timeout / error / low-confidence (<0.9), caller falls back to chips
//   - Per-market `nlp_chip_only` toggle disables LLM entirely for chip-only
//
// This module is the contract — the caller (the form) decides what to do
// with low-confidence or null results. We never silently substitute "now"
// for a failed parse; that would push riders into rides at the wrong time.
//
// IMPORTANT — the OpenAI call requires OPENAI_API_KEY which is server-only.
// `OpenAIParser.parse()` therefore makes a fetch to a server endpoint
// rather than calling OpenAI directly. The endpoint lives in Stream B's
// `app/api/blast/**` ownership; until Stream B implements it, the route
// returns 501 and we degrade to chip-only. That fallback is by design,
// not a missing feature.

// ============================================================================
// Public types
// ============================================================================

export interface DateParseResult {
  /** Parsed timestamp, or null if the parser couldn't resolve anything usable. */
  scheduledFor: Date | null;
  /** 0..1 confidence. Callers should treat <0.9 as "show the chip picker". */
  confidence: number;
  /** Echoed back so the form can show the user what was understood. */
  rawText?: string;
}

export interface DateParserProvider {
  /** Stable name used for analytics tagging + provider swap-out. */
  name: string;
  parse(text: string): Promise<DateParseResult>;
}

// ============================================================================
// ChipOnlyParser — always returns null so the caller falls back to chips
// ============================================================================

export class ChipOnlyParser implements DateParserProvider {
  readonly name = 'chip_only';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async parse(_text: string): Promise<DateParseResult> {
    return { scheduledFor: null, confidence: 0 };
  }
}

// ============================================================================
// OpenAIParser — calls a server endpoint that fronts gpt-4o-mini
// ============================================================================

interface OpenAIParserOpts {
  /** Override the timeout in ms. Default 1500 per contract. */
  timeoutMs?: number;
  /** Override the endpoint path. Default /api/blast/parse-date. */
  endpoint?: string;
  /** Custom fetch (tests). Default global fetch. */
  fetchImpl?: typeof fetch;
}

export class OpenAIParser implements DateParserProvider {
  readonly name = 'openai_gpt4o_mini';
  private readonly timeoutMs: number;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIParserOpts = {}) {
    this.timeoutMs = opts.timeoutMs ?? 1500;
    // Stream B owns the `/api/blast/**` namespace; this path is provisional and
    // returns 501 until Stream B wires the actual gpt-4o-mini call. The form
    // already handles that gracefully (drops to chips), so shipping the parser
    // now doesn't depend on Stream B.
    this.endpoint = opts.endpoint ?? '/api/blast/parse-date';
    this.fetchImpl =
      opts.fetchImpl ??
      (typeof fetch !== 'undefined'
        ? fetch.bind(globalThis)
        : (() => {
            throw new Error('No fetch implementation available');
          })());
  }

  async parse(text: string): Promise<DateParseResult> {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return { scheduledFor: null, confidence: 0, rawText: text };
    }

    // AbortController gives us a clean cancellation when the request exceeds
    // our timeout — important inside a form because a slow LLM round-trip
    // would otherwise stall the "Continue" tap and hurt the perceived feel.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          // Anchor the parse to the user's local "now" so "tonight 8pm" lands
          // on the right calendar day. We also pass the IANA timezone offset
          // string so the server doesn't have to guess.
          nowIso: new Date().toISOString(),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        }),
        signal: controller.signal,
      });

      // Stream B not yet implemented (501) → degrade to chips. Same handling
      // for any 4xx/5xx — don't pretend we parsed something we didn't.
      if (!res.ok) {
        return { scheduledFor: null, confidence: 0, rawText: text };
      }

      const data = (await res.json().catch(() => null)) as {
        scheduledFor?: string | null;
        confidence?: number;
      } | null;
      if (!data || typeof data.scheduledFor !== 'string' || typeof data.confidence !== 'number') {
        return { scheduledFor: null, confidence: 0, rawText: text };
      }

      // Trust the LLM's confidence number but still validate the parsed
      // ISO. A malformed date string from a hallucination should never
      // become an actual `new Date(NaN)` we ship to the form.
      const parsedDate = new Date(data.scheduledFor);
      if (Number.isNaN(parsedDate.getTime())) {
        return { scheduledFor: null, confidence: 0, rawText: text };
      }

      // Refuse anything in the past — even if the LLM is confident, "tomorrow"
      // resolved to yesterday is always wrong. Fall through to chip picker.
      if (parsedDate.getTime() < Date.now() - 60_000) {
        return { scheduledFor: null, confidence: 0, rawText: text };
      }

      return {
        scheduledFor: parsedDate,
        confidence: Math.max(0, Math.min(1, data.confidence)),
        rawText: text,
      };
    } catch (err) {
      // AbortError, network error, JSON error — all degrade to chip picker.
      void err;
      return { scheduledFor: null, confidence: 0, rawText: text };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export interface DateParserMarketHints {
  /** Per-market admin toggle from the blast config. When true, skip the LLM. */
  nlp_chip_only?: boolean;
}

/**
 * Pick the right parser based on market config. The form calls this on mount
 * and reuses the same instance for the duration of the form session.
 *
 * If `nlp_chip_only` is true (an admin lever in Stream E's config UI), we
 * never even instantiate an OpenAI parser — the caller will display chips
 * exclusively. Otherwise we return `OpenAIParser` and let it self-degrade
 * to "no result" on any failure mode (timeout, 501, low confidence, etc.).
 */
export function getDateParser(market?: DateParserMarketHints): DateParserProvider {
  if (market?.nlp_chip_only === true) return new ChipOnlyParser();
  return new OpenAIParser();
}

// Convenience: the canonical confidence cutoff the contract names. Caller is
// free to override but most surfaces should use the same threshold so the
// fallback behavior is consistent.
export const NLP_CONFIDENCE_CUTOFF = 0.9;
