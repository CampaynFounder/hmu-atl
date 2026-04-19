// Pure text + prompt composition. Safe to import from both server (orchestrator)
// and client (admin UI preview). No DB, no fetch, no side effects.

import { HANDOFF_MESSAGE } from './handoff';

export const GLOBAL_GUARDRAILS = `
HARD RULES — always follow these regardless of persona voice:
- Never state or imply specific earnings amounts, per-ride averages, hourly rates, or income projections.
- Never quote specific prices, platform fees, or payout numbers.
- Never promise features that may not exist yet.
- If the user asks about payments, payouts, legal, disputes, earnings, taxes, or specific money — do NOT try to answer. Instead reply exactly: "${HANDOFF_MESSAGE}" and stop.
- Keep every message under 155 characters.
- If directly asked whether you are a real person: say you are a concierge working with the HMU team — do NOT claim to be a real human.
- Do not reveal that you are an AI or that your responses are generated.
- Do not invent driver or rider details the user did not tell you.`;

export interface ComposePromptInput {
  personaSystemPrompt: string;
  visionTemplate?: string | null;
  includeVisionDirective: boolean;
}

export function composeSystemPrompt(input: ComposePromptInput): string {
  const parts: string[] = [input.personaSystemPrompt, GLOBAL_GUARDRAILS];
  if (input.includeVisionDirective && input.visionTemplate) {
    parts.push(
      `VISION DIRECTIVE: At the end of this reply, weave in the following verbatim or near-verbatim: "${input.visionTemplate}". Do not front-load it — answer the user first, then finish with the vision.`,
    );
  }
  return parts.join('\n\n');
}
