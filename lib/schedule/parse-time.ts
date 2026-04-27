/**
 * Parse natural language time strings into ISO timestamps.
 * Handles: "now", "asap", "tomorrow 2pm", "next Friday", "this Sunday 3pm",
 * "Monday", "Saturday evening", "next week Tuesday", etc.
 *
 * Wall-clock times are interpreted in the caller-supplied IANA timezone
 * (e.g. 'America/New_York' for ATL, 'America/Chicago' for NOLA) and stored
 * as UTC ISO strings. Display strings echo back the time in that same zone
 * with no TZ abbreviation — see feedback memory: rider/driver UI must not
 * surface zone tokens.
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
 * Get current wall-clock time components in the given IANA timezone.
 */
function nowInTZ(tz: string): { year: number; month: number; day: number; hour: number; minute: number; second: number; dayOfWeek: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')) - 1,
    day: parseInt(get('day')),
    hour: parseInt(get('hour')),
    minute: parseInt(get('minute')),
    second: parseInt(get('second')),
    dayOfWeek: dayMap[get('weekday')] ?? new Date().getDay(),
  };
}

/**
 * Convert a wall-clock time in the given timezone to a UTC ISO string.
 * Round-trips through Intl so DST is handled correctly.
 */
function wallToUTC(year: number, month: number, day: number, hour: number, minute: number, tz: string): string {
  const guess = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(guess);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
  const tzHour = get('hour');
  const tzDay = get('day');

  let hourDiff = tzHour - hour;
  let dayDiff = tzDay - day;
  if (dayDiff > 15) dayDiff -= 30;
  if (dayDiff < -15) dayDiff += 30;
  const totalOffsetHours = hourDiff + (dayDiff * 24);

  const utc = new Date(Date.UTC(year, month, day, hour - totalOffsetHours, minute, 0, 0));
  return utc.toISOString();
}

/**
 * Format a UTC ISO string for display in the given timezone.
 * Drops the year when it matches the current year in that zone.
 * Never emits a TZ abbreviation — single-market voice for the rider.
 */
function formatDisplay(isoUtc: string, tz: string): string {
  const d = new Date(isoUtc);
  const currentYear = nowInTZ(tz).year;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const weekday = get('weekday');
  const month = get('month');
  const day = get('day');
  const year = parseInt(get('year'));
  const hour = get('hour');
  const minute = get('minute');
  const dayPeriod = get('dayPeriod');

  const datePart = year !== currentYear
    ? `${weekday} ${month} ${day} ${year}`
    : `${weekday} ${month} ${day}`;
  return `${datePart} at ${hour}:${minute} ${dayPeriod}`;
}

/**
 * Parse a natural language time string to an ISO timestamp + display string.
 * Returns current time as fallback if unparseable.
 *
 * @param tz IANA timezone for wall-clock interpretation. Defaults to ET so
 *           legacy callers (ATL-only) keep working unchanged.
 */
export function parseNaturalTime(timeStr: string, tz: string = DEFAULT_TZ): ParsedTime {
  if (!timeStr) return makeNow();

  const raw = timeStr.trim();
  const lower = raw.toLowerCase();

  if (lower === 'now' || lower === 'asap' || lower === 'rn') {
    return makeNow();
  }

  const tzNow = nowInTZ(tz);

  // ── Try ISO / standard date parse ──
  const directParse = new Date(raw);
  if (!isNaN(directParse.getTime()) && directParse.getTime() > Date.now() - 86400000) {
    const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw.trim());
    if (hasTimezone) {
      return { iso: directParse.toISOString(), display: formatDisplay(directParse.toISOString(), tz), isNow: false };
    }
    // No timezone in input — interpret as local wall-clock in target zone
    const utcParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(directParse);
    const get = (type: string) => parseInt(utcParts.find(p => p.type === type)?.value || '0');
    const iso = wallToUTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), tz);
    return { iso, display: formatDisplay(iso, tz), isNow: false };
  }

  let year = tzNow.year;
  let month = tzNow.month;
  let day = tzNow.day;
  let hour = 12;
  let minute = 0;

  if (lower.startsWith('today')) {
    applyTime(lower, { hour: tzNow.hour, minute: tzNow.minute }, (h, m) => { hour = h; minute = m; });
    if (hour < tzNow.hour || (hour === tzNow.hour && minute < tzNow.minute)) {
      hour = tzNow.hour;
      minute = tzNow.minute;
    }
    const iso = wallToUTC(year, month, day, hour, minute, tz);
    return { iso, display: formatDisplay(iso, tz), isNow: false };
  }

  if (lower === 'tonight') {
    hour = 20;
    const iso = wallToUTC(year, month, day, hour, 0, tz);
    return { iso, display: formatDisplay(iso, tz), isNow: false };
  }

  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(year, month, day + 1);
    year = tomorrow.getFullYear();
    month = tomorrow.getMonth();
    day = tomorrow.getDate();
    applyTime(lower, { hour: 12, minute: 0 }, (h, m) => { hour = h; minute = m; });
    const iso = wallToUTC(year, month, day, hour, minute, tz);
    return { iso, display: formatDisplay(iso, tz), isNow: false };
  }

  const dayMatch = matchDayOfWeek(lower);
  if (dayMatch !== null) {
    const isNext = lower.includes('next');
    const currentDay = tzNow.dayOfWeek;
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
    applyTime(lower, { hour: 12, minute: 0 }, (h, m) => { hour = h; minute = m; });
    const iso = wallToUTC(year, month, day, hour, minute, tz);
    return { iso, display: formatDisplay(iso, tz), isNow: false };
  }

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
    return { iso: d.toISOString(), display: formatDisplay(d.toISOString(), tz), isNow: false };
  }

  if (lower.includes('next week')) {
    const target = new Date(year, month, day + 7);
    year = target.getFullYear();
    month = target.getMonth();
    day = target.getDate();
    applyTime(lower, { hour: 12, minute: 0 }, (h, m) => { hour = h; minute = m; });
    const iso = wallToUTC(year, month, day, hour, minute, tz);
    return { iso, display: formatDisplay(iso, tz), isNow: false };
  }

  return makeNow();
}

function matchDayOfWeek(lower: string): number | null {
  const sorted = Object.entries(DAY_NAMES).sort((a, b) => b[0].length - a[0].length);
  for (const [name, num] of sorted) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(lower)) return num;
  }
  return null;
}

function applyTime(
  lower: string,
  defaults: { hour: number; minute: number },
  set: (h: number, m: number) => void
): void {
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

  for (const [word, hour] of Object.entries(TIME_OF_DAY)) {
    if (lower.includes(word)) {
      set(hour, 0);
      return;
    }
  }

  set(defaults.hour, defaults.minute);
}

function makeNow(): ParsedTime {
  return { iso: new Date().toISOString(), display: 'Now', isNow: true };
}
