// Claude API client for conversational replies.
// Raw fetch pattern (same as lib/content/claude.ts). Haiku 4.5 by default —
// fast + cheap for short SMS responses.
//
// Cost estimation: Haiku 4.5 lists around $1/MTok input, $5/MTok output.
// We round each call up to whole cents and add to a rolling daily counter
// in conversation_agent_config. If the counter meets the cap, callers get
// { success: false, reason: 'spend-cap-reached' } and MUST NOT send the SMS.

import { sql } from '@/lib/db/client';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Haiku 4.5 pricing in USD per million tokens.
const INPUT_USD_PER_MTOK = 1;
const OUTPUT_USD_PER_MTOK = 5;

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateReplyInput {
  model: string;                      // e.g. 'claude-haiku-4-5-20251001'
  systemPrompt: string;
  messages: ClaudeMessage[];
  maxTokens?: number;                 // default 256 (well within 155-char SMS)
  temperature?: number;               // default 0.7
}

export type GenerateReplyResult =
  | { success: true; text: string; inputTokens: number; outputTokens: number; costCents: number }
  | { success: false; error: string; status?: number };

export async function generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY not configured' };
  }

  const body = {
    model: input.model,
    max_tokens: input.maxTokens ?? 256,
    temperature: input.temperature ?? 0.7,
    system: input.systemPrompt,
    messages: input.messages,
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: `Claude API ${res.status}: ${errText.slice(0, 200)}`, status: res.status };
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text ?? '')
      .join('\n')
      .trim();

    if (!text) {
      return { success: false, error: 'Claude returned empty response' };
    }

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const costCents = estimateCostCents(inputTokens, outputTokens);

    return { success: true, text, inputTokens, outputTokens, costCents };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'fetch failed' };
  }
}

export function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const inputUsd = (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK;
  const outputUsd = (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  const cents = (inputUsd + outputUsd) * 100;
  // Round UP to next cent — we'd rather over-report spend than under.
  return Math.max(1, Math.ceil(cents));
}

// ────────────────────────────────────────────────────────────────────
// Rolling daily spend tracking.
// Atomic increment+reset using CURRENT_DATE as the day boundary. If the stored
// reset_date differs from today, we reset to `add` and advance the date.
// ────────────────────────────────────────────────────────────────────

export interface SpendState {
  spentTodayCents: number;
  capCents: number | null;
  resetDate: string;
}

export async function getSpendState(): Promise<SpendState> {
  const rows = await sql`
    SELECT claude_spend_today_cents, daily_spend_cap_cents, claude_spend_reset_date
    FROM conversation_agent_config WHERE id = 1 LIMIT 1
  `;
  const r = rows[0] as {
    claude_spend_today_cents: number;
    daily_spend_cap_cents: number | null;
    claude_spend_reset_date: string;
  } | undefined;
  return {
    spentTodayCents: r?.claude_spend_today_cents ?? 0,
    capCents: r?.daily_spend_cap_cents ?? null,
    resetDate: r?.claude_spend_reset_date ?? new Date().toISOString().slice(0, 10),
  };
}

// Returns effective spent-today that correctly handles a crossed date boundary.
function effectiveSpentToday(state: SpendState): number {
  const today = new Date().toISOString().slice(0, 10);
  return state.resetDate === today ? state.spentTodayCents : 0;
}

// Check BEFORE a Claude call. Returns true if under cap (or no cap configured).
export async function canAffordCall(): Promise<{ ok: boolean; state: SpendState }> {
  const state = await getSpendState();
  if (state.capCents == null) return { ok: true, state };
  const spent = effectiveSpentToday(state);
  return { ok: spent < state.capCents, state };
}

// Increment AFTER a Claude call. If date rolled over, we reset to just this call.
export async function recordSpend(costCents: number): Promise<void> {
  await sql`
    UPDATE conversation_agent_config
    SET
      claude_spend_today_cents = CASE
        WHEN claude_spend_reset_date < CURRENT_DATE THEN ${costCents}
        ELSE claude_spend_today_cents + ${costCents}
      END,
      claude_spend_reset_date = CURRENT_DATE
    WHERE id = 1
  `;
}
