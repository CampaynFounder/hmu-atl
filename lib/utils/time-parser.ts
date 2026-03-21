/**
 * Parse shorthand time strings into display-friendly format.
 * Examples: "2mor" → tomorrow, "2n" → tonight, "2pm" → today 2:00 PM,
 * "in 30 min" → 30 min from now, "asap" → ASAP
 */
export function parseTimeShorthand(input: string): { display: string; raw: string } {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  if (!raw) return { display: 'ASAP', raw: '' };

  // ASAP / now
  if (['asap', 'now', 'rn'].includes(lower)) {
    return { display: 'ASAP', raw };
  }

  // Tomorrow variants
  if (['2mor', '2morrow', 'tmr', 'tmrw', 'tomorrow'].includes(lower)) {
    return { display: 'Tomorrow', raw };
  }

  // Tonight variants
  if (['2n', '2nite', 'tonight', '2night'].includes(lower)) {
    return { display: 'Tonight', raw };
  }

  // "in X min" / "in X hours"
  const inMatch = lower.match(/^in\s+(\d+)\s*(min|mins|minutes?|hr|hrs|hours?)$/);
  if (inMatch) {
    const num = parseInt(inMatch[1]);
    const unit = inMatch[2].startsWith('h') ? 'hr' : 'min';
    return { display: `In ${num} ${unit}`, raw };
  }

  // Time like "2pm", "3:30pm", "11am"
  const timeMatch = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] || '00';
    const period = timeMatch[3].toUpperCase();
    if (hour > 12) hour = hour % 12;
    return { display: `Today ${hour}:${minutes} ${period}`, raw };
  }

  // Pass through as-is
  return { display: raw, raw };
}
