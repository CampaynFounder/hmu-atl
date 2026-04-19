// Hand-off detection — regex screen for incoming messages that should NOT be
// answered by Claude. Catches payment/earnings/legal questions. System prompt
// also forbids these answers, but the regex is a defense-in-depth fail-fast
// that avoids any LLM call at all.
//
// Intentionally aggressive with word boundaries. False positives just route
// the user to human support — no harm done.

const HANDOFF_PATTERNS: RegExp[] = [
  // Money questions
  /\bhow\s+much\b/i,
  /\bearn(ings?|ed|ing|er)?\b/i,
  /\bsalary\b/i,
  /\bincome\b/i,
  /\bmake\s+(money|bank|a?\s*living)\b/i,

  // Payments
  /\bpaid\b/i,
  /\bpayment\b/i,
  /\bpayout(s)?\b/i,
  /\brefund\b/i,
  /\breimburs\w*/i,
  /\bchargeback\b/i,
  /\bdeposit\b/i,

  // Prices / rates / fees
  /\bfee(s)?\b/i,
  /\brate(s)?\b/i,
  /\bcost(s|ing)?\b/i,
  /\bprice\b/i,
  /\bpricing\b/i,

  // Legal / dispute
  /\blegal\b/i,
  /\blawyer\b/i,
  /\bsue\b/i,
  /\blawsuit\b/i,
  /\bdispute\b/i,
  /\bcomplain(t|ts|ing|ed)?\b/i,

  // Tax
  /\btax(es)?\b/i,
  /\b1099\b/i,
  /\bw[-\s]?2\b/i,

  // Payout rails
  /\bstripe\b/i,
  /\bvenmo\b/i,
  /\bcash\s?app\b/i,
  /\bpaypal\b/i,
  /\bzelle\b/i,
];

export function needsHandoff(message: string): { handoff: boolean; matchedPattern?: string } {
  const trimmed = message.trim();
  for (const p of HANDOFF_PATTERNS) {
    if (p.test(trimmed)) {
      return { handoff: true, matchedPattern: p.source };
    }
  }
  return { handoff: false };
}

// Canned response. Short, friendly, matches the persona voice pattern from
// the system prompts. Admin can override per-persona later if needed.
export const HANDOFF_MESSAGE = 'Gotchu — real person from the team will hit you up on this one. Hold tight.';
