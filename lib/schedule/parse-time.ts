/**
 * Parse natural language time strings into ISO timestamps.
 * Handles: "now", "asap", "tomorrow 2pm", "next Friday", "this Sunday 3pm",
 * "Monday", "Saturday evening", "next week Tuesday", etc.
 *
 * All times resolved in Eastern Time (Atlanta).
 */

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const TIME_OF_DAY: Record<string, number> = {
  morning: 9,
  afternoon: 14,
  evening: 18,
  night: 20,
  noon: 12,
  midnight: 0,
};

interface ParsedTime {
  iso: string;
  display: string;  // Human-readable confirmation string
  isNow: boolean;
}

/**
 * Parse a natural language time string to an ISO timestamp + display string.
 * Returns current time as fallback if unparseable.
 */
export function parseNaturalTime(timeStr: string): ParsedTime {
  if (!timeStr) return makeNow();

  const raw = timeStr.trim();
  const lower = raw.toLowerCase();

  // ── Immediate ──
  if (lower === 'now' || lower === 'asap' || lower === 'rn') {
    return makeNow();
  }

  // ── Try ISO / standard date parse first ──
  const directParse = new Date(raw);
  if (!isNaN(directParse.getTime()) && directParse.getTime() > Date.now() - 86400000) {
    return { iso: directParse.toISOString(), display: formatDisplay(directParse), isNow: false };
  }

  const now = new Date();

  // ── "today" ──
  if (lower.startsWith('today')) {
    const d = new Date(now);
    applyTime(d, lower);
    if (d.getTime() < now.getTime()) d.setTime(now.getTime()); // don't go backwards
    return { iso: d.toISOString(), display: formatDisplay(d), isNow: false };
  }

  // ── "tonight" ──
  if (lower === 'tonight') {
    const d = new Date(now);
    d.setHours(20, 0, 0, 0);
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
    return { iso: d.toISOString(), display: formatDisplay(d), isNow: false };
  }

  // ── "tomorrow" ──
  if (lower.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    applyTime(d, lower);
    return { iso: d.toISOString(), display: formatDisplay(d), isNow: false };
  }

  // ── Day-of-week: "Friday", "next Friday", "this Sunday", "next week Monday" ──
  const dayMatch = matchDayOfWeek(lower);
  if (dayMatch !== null) {
    const isNext = lower.includes('next');
    const d = getNextDayOfWeek(now, dayMatch, isNext);
    applyTime(d, lower);
    return { iso: d.toISOString(), display: formatDisplay(d), isNow: false };
  }

  // ── "in X hours/minutes/days" ──
  const inMatch = lower.match(/in\s+(\d+)\s*(hour|hr|minute|min|day)/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const d = new Date(now);
    if (unit.startsWith('hour') || unit.startsWith('hr')) d.setHours(d.getHours() + amount);
    else if (unit.startsWith('min')) d.setMinutes(d.getMinutes() + amount);
    else if (unit.startsWith('day')) d.setDate(d.getDate() + amount);
    return { iso: d.toISOString(), display: formatDisplay(d), isNow: false };
  }

  // ── "next week" (no specific day) ──
  if (lower.includes('next week')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    applyTime(d, lower);
    return { iso: d.toISOString(), display: formatDisplay(d), isNow: false };
  }

  // ── Fallback: return now ──
  return makeNow();
}

/** Find a day-of-week name in the string */
function matchDayOfWeek(lower: string): number | null {
  // Check longest names first to avoid "sun" matching inside "sunday"
  const sorted = Object.entries(DAY_NAMES).sort((a, b) => b[0].length - a[0].length);
  for (const [name, num] of sorted) {
    // Match whole word boundaries
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(lower)) return num;
  }
  return null;
}

/** Get the next occurrence of a day of the week */
function getNextDayOfWeek(from: Date, targetDay: number, forceNextWeek: boolean): Date {
  const d = new Date(from);
  const currentDay = d.getDay();
  let daysAhead = targetDay - currentDay;

  if (forceNextWeek) {
    // "next Friday" — always at least 7 days ahead if same day, otherwise next occurrence in next week
    if (daysAhead <= 0) daysAhead += 7;
    if (daysAhead < 7) daysAhead += 7; // ensure it's in the NEXT week
  } else {
    // "this Friday" / "Friday" — next occurrence (could be this week if still ahead)
    if (daysAhead <= 0) daysAhead += 7;
  }

  d.setDate(d.getDate() + daysAhead);
  d.setHours(12, 0, 0, 0); // Default to noon
  return d;
}

/** Apply a time-of-day from the string to the date (e.g. "3pm", "evening") */
function applyTime(d: Date, lower: string): void {
  // Check for explicit time like "2pm", "3:30am", "14:00"
  const hourMin = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm|a|p)?/i);
  if (hourMin) {
    let hr = parseInt(hourMin[1]);
    const min = parseInt(hourMin[2]);
    const ampm = hourMin[3]?.toLowerCase();
    if (ampm?.startsWith('p') && hr < 12) hr += 12;
    if (ampm?.startsWith('a') && hr === 12) hr = 0;
    d.setHours(hr, min, 0, 0);
    return;
  }

  const hourOnly = lower.match(/(\d{1,2})\s*(am|pm|a|p)/i);
  if (hourOnly) {
    let hr = parseInt(hourOnly[1]);
    if (hourOnly[2].toLowerCase().startsWith('p') && hr < 12) hr += 12;
    if (hourOnly[2].toLowerCase().startsWith('a') && hr === 12) hr = 0;
    d.setHours(hr, 0, 0, 0);
    return;
  }

  // Check for time-of-day words
  for (const [word, hour] of Object.entries(TIME_OF_DAY)) {
    if (lower.includes(word)) {
      d.setHours(hour, 0, 0, 0);
      return;
    }
  }

  // No time specified — default to noon
  d.setHours(12, 0, 0, 0);
}

/** Format a date for display confirmation (e.g. "Fri Apr 11, 2026 at 3:00 PM") */
function formatDisplay(d: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const day = days[d.getDay()];
  const month = months[d.getMonth()];
  const date = d.getDate();
  const year = d.getFullYear();

  let hr = d.getHours();
  const min = d.getMinutes();
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  const minStr = min > 0 ? `:${String(min).padStart(2, '0')}` : '';

  return `${day} ${month} ${date}, ${year} at ${hr}${minStr} ${ampm}`;
}

function makeNow(): ParsedTime {
  return { iso: new Date().toISOString(), display: 'Now', isNow: true };
}
