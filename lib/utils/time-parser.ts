/**
 * Parse shorthand time strings into display-friendly format.
 * Supports fuzzy input: "2mor", "2n", "tonight", "2pm", "2mor 2pm",
 * "tonight 8pm", "2n 9:30pm", "in 30 min", "asap"
 */
export function parseTimeShorthand(input: string): { display: string; raw: string } {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  if (!raw) return { display: 'ASAP', raw: '' };

  // ASAP / now
  if (['asap', 'now', 'rn'].includes(lower)) {
    return { display: 'ASAP', raw };
  }

  // "in X min" / "in X hours"
  const inMatch = lower.match(/^in\s+(\d+)\s*(min|mins|minutes?|hr|hrs|hours?)$/);
  if (inMatch) {
    const num = parseInt(inMatch[1]);
    const unit = inMatch[2].startsWith('h') ? 'hr' : 'min';
    return { display: `In ${num} ${unit}`, raw };
  }

  // Day keywords
  const tomorrowWords = ['2mor', '2morrow', 'tmr', 'tmrw', 'tomorrow', '2mro', '2mrw'];
  const tonightWords = ['2n', '2nite', 'tonight', '2night', '2nght'];

  // Check for compound: "day + time" (e.g. "2mor 2pm", "tonight 8:30pm")
  const parts = lower.split(/\s+/);

  let dayPart: string | null = null;
  let timePart: string | null = null;

  for (const part of parts) {
    if (tomorrowWords.includes(part)) {
      dayPart = 'Tomorrow';
    } else if (tonightWords.includes(part)) {
      dayPart = 'Tonight';
    } else if (['today', '2day'].includes(part)) {
      dayPart = 'Today';
    } else {
      // Try to parse as time
      const timeMatch = part.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] || '00';
        const period = timeMatch[3].toUpperCase();
        if (hour > 12) hour = hour % 12;
        timePart = `${hour}:${minutes} ${period}`;
      }
    }
  }

  // Compound: day + time
  if (dayPart && timePart) {
    return { display: `${dayPart} ${timePart}`, raw };
  }

  // Day only
  if (dayPart) {
    return { display: dayPart, raw };
  }

  // Time only (today implied)
  if (timePart) {
    return { display: `Today ${timePart}`, raw };
  }

  // Pass through as-is
  return { display: raw, raw };
}
