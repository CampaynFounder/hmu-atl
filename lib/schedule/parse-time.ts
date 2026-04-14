/**
 * Parse natural language time strings into ISO timestamps.
 * Handles: "now", "asap", "tomorrow 2pm", "next Friday", "this Sunday 3pm",
 * "Monday", "Saturday evening", "next week Tuesday", etc.
 *
 * All times resolved in Eastern Time (Atlanta) then stored as UTC ISO strings.
 */

const DEFAULT_TZ = 'America/New_York';

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
 * Get current wall-clock time components in Eastern Time.
 * Returns { year, month (0-based), day, hour, minute, second, dayOfWeek }.
 */
function nowInET(): { year: number; month: number; day: number; hour: number; minute: number; second: number; dayOfWeek: number } {
  const now = new Date();
  // Use Intl to get ET components
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')) - 1, // 0-based
    day: parseInt(get('day')),
    hour: parseInt(get('hour')),
    minute: parseInt(get('minute')),
    second: parseInt(get('second')),
    dayOfWeek: dayMap[get('weekday')] ?? new Date().getDay(),
  };
}

/**
 * Convert a wall-clock time in Eastern to a UTC ISO string.
 * This handles EST/EDT automatically by round-tripping through Intl.
 */
function etToUTC(year: number, month: number, day: number, hour: number, minute: number): string {
  // Build a date string that we can parse in ET context
  // Use a trick: create a UTC date, then find the offset for that date in ET
  const guess = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));

  // Get what ET thinks the time is for our guess
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(guess);

  const get = (type: string) => parseInt(etParts.find(p => p.type === type)?.value || '0');
  const etHour = get('hour');
  const etDay = get('day');

  // Calculate the offset: how many hours ahead/behind UTC is ET for this date
  // If we put hour=14 into UTC and ET reads it as 10, offset is -4 (EDT)
  let hourDiff = etHour - hour;
  let dayDiff = etDay - day;
  if (dayDiff > 15) dayDiff -= 30; // month wrap
  if (dayDiff < -15) dayDiff += 30;
  const totalOffsetHours = hourDiff + (dayDiff * 24);

  // To store "9:30 AM ET" as UTC: subtract the offset
  // If ET is UTC-4 (EDT), offset = -4, so UTC = 9:30 - (-4) = 13:30 UTC
  const utc = new Date(Date.UTC(year, month, day, hour - totalOffsetHours, minute, 0, 0));
  return utc.toISOString();
}

/**
 * Format a UTC ISO string for display in Eastern Time.
 */
function formatDisplayET(isoUtc: string): string {
  const d = new Date(isoUtc);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TZ,
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  // "Fri, Apr 11, 2026, 3:00 PM" → "Fri Apr 11, 2026 at 3:00 PM"
  return fmt.format(d).replace(',', '').replace(/,\s*(\d)/, ' at $1');
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

  const et = nowInET();

  // ── Try ISO / standard date parse ──
  // If the input looks like an ISO string or standard date format, parse it
  // but interpret it as ET if it has no timezone indicator
  const directParse = new Date(raw);
  if (!isNaN(directParse.getTime()) && directParse.getTime() > Date.now() - 86400000) {
    // Check if the raw string has a timezone indicator (Z, +, -)
    const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw.trim());
    if (hasTimezone) {
      // Already has timezone — use as-is
      return { iso: directParse.toISOString(), display: formatDisplayET(directParse.toISOString()), isNow: false };
    }
    // No timezone — interpret as ET
    // Extract the date components the parser found and re-resolve in ET
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(directParse);
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
    const iso = etToUTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return { iso, display: formatDisplayET(iso), isNow: false };
  }

  // Working date components in ET
  let year = et.year;
  let month = et.month;
  let day = et.day;
  let hour = 12; // default noon
  let minute = 0;

  // ── "today" ──
  if (lower.startsWith('today')) {
    applyTimeET(lower, { hour: et.hour, minute: et.minute }, (h, m) => { hour = h; minute = m; });
    // Don't go backwards
    if (hour < et.hour || (hour === et.hour && minute < et.minute)) {
      hour = et.hour;
      minute = et.minute;
    }
    const iso = etToUTC(year, month, day, hour, minute);
    return { iso, display: formatDisplayET(iso), isNow: false };
  }

  // ── "tonight" ──
  if (lower === 'tonight') {
    hour = 20;
    const iso = etToUTC(year, month, day, hour, 0);
    return { iso, display: formatDisplayET(iso), isNow: false };
  }

  // ── "tomorrow" ──
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(year, month, day + 1);
    year = tomorrow.getFullYear();
    month = tomorrow.getMonth();
    day = tomorrow.getDate();
    applyTimeET(lower, { hour: 12, minute: 0 }, (h, m) => { hour = h; minute = m; });
    const iso = etToUTC(year, month, day, hour, minute);
    return { iso, display: formatDisplayET(iso), isNow: false };
  }

  // ── Day-of-week: "Friday", "next Friday", "this Sunday", "next week Monday" ──
  const dayMatch = matchDayOfWeek(lower);
  if (dayMatch !== null) {
    const isNext = lower.includes('next');
    const currentDay = et.dayOfWeek;
    let daysAhead = dayMatch - currentDay;

    if (isNext) {
      if (daysAhead <= 0) daysAhead += 7;
      if (daysAhead < 7) daysAhead += 7;
    } else {
      if (daysAhead <= 0) daysAhead += 7;
    }

    const target = new Date(year, month, day + daysAhead);
    year = target.getFullYear();
    month = target.getMonth();
    day = target.getDate();
    applyTimeET(lower, { hour: 12, minute: 0 }, (h, m) => { hour = h; minute = m; });
    const iso = etToUTC(year, month, day, hour, minute);
    return { iso, display: formatDisplayET(iso), isNow: false };
  }

  // ── "in X hours/minutes/days" ──
  const inMatch = lower.match(/in\s+(\d+)\s*(hour|hr|minute|min|day)/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const nowMs = Date.now();
    let ms = 0;
    if (unit.startsWith('hour') || unit.startsWith('hr')) ms = amount * 3600000;
    else if (unit.startsWith('min')) ms = amount * 60000;
    else if (unit.startsWith('day')) ms = amount * 86400000;
    const d = new Date(nowMs + ms);
    return { iso: d.toISOString(), display: formatDisplayET(d.toISOString()), isNow: false };
  }

  // ── "next week" (no specific day) ──
  if (lower.includes('next week')) {
    const target = new Date(year, month, day + 7);
    year = target.getFullYear();
    month = target.getMonth();
    day = target.getDate();
    applyTimeET(lower, { hour: 12, minute: 0 }, (h, m) => { hour = h; minute = m; });
    const iso = etToUTC(year, month, day, hour, minute);
    return { iso, display: formatDisplayET(iso), isNow: false };
  }

  // ── Fallback: return now ──
  return makeNow();
}

/** Find a day-of-week name in the string */
function matchDayOfWeek(lower: string): number | null {
  const sorted = Object.entries(DAY_NAMES).sort((a, b) => b[0].length - a[0].length);
  for (const [name, num] of sorted) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(lower)) return num;
  }
  return null;
}

/** Extract time-of-day from the string and call the setter */
function applyTimeET(
  lower: string,
  defaults: { hour: number; minute: number },
  set: (h: number, m: number) => void
): void {
  // Check for explicit time like "2pm", "3:30am", "14:00"
  const hourMin = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm|a|p)?/i);
  if (hourMin) {
    let hr = parseInt(hourMin[1]);
    const min = parseInt(hourMin[2]);
    const ampm = hourMin[3]?.toLowerCase();
    if (ampm?.startsWith('p') && hr < 12) hr += 12;
    if (ampm?.startsWith('a') && hr === 12) hr = 0;
    set(hr, min);
    return;
  }

  const hourOnly = lower.match(/(\d{1,2})\s*(am|pm|a|p)/i);
  if (hourOnly) {
    let hr = parseInt(hourOnly[1]);
    if (hourOnly[2].toLowerCase().startsWith('p') && hr < 12) hr += 12;
    if (hourOnly[2].toLowerCase().startsWith('a') && hr === 12) hr = 0;
    set(hr, 0);
    return;
  }

  // Check for time-of-day words
  for (const [word, hour] of Object.entries(TIME_OF_DAY)) {
    if (lower.includes(word)) {
      set(hour, 0);
      return;
    }
  }

  // No time specified — use defaults
  set(defaults.hour, defaults.minute);
}

function makeNow(): ParsedTime {
  return { iso: new Date().toISOString(), display: 'Now', isNow: true };
}
