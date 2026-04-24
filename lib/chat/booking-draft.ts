/**
 * Canonical booking draft used by the chat flow.
 *
 * Purpose: keep the deterministic parts of chat booking (slot completeness,
 * availability window, round-trip duration, buffer, price floor) OUT of the
 * GPT tool loop. The model extracts fields and paraphrases; this module owns
 * the math and the gates.
 */

import { parseNaturalTime } from '@/lib/schedule/parse-time';

export interface BookingDraft {
  pickup?: string;
  dropoff?: string;
  stops?: string;
  roundTrip?: boolean;

  /** Rider's original time words, e.g. "next Friday 3pm" */
  timeRaw?: string;
  /** Deterministic ISO resolution of timeRaw */
  timeIso?: string;
  /** Friendly display string for the rider-facing summary */
  timeDisplay?: string;
  /** True when rider said "now" / "asap" — shorter availability buffer */
  isNow?: boolean;

  routeDistanceMi?: number;
  routeDurationMin?: number;

  driverMinimum?: number;
  uberEstimate?: number;
  suggestedPrice?: number;
  riderPrice?: number;

  isCash?: boolean;
}

export type DraftSlot = 'pickup' | 'dropoff' | 'time' | 'price' | 'payment';

/** Driver's payment config, used by missingSlots to decide whether the
 *  rider needs to explicitly pick cash or card. */
export interface DriverPaymentConfig {
  cashOnly: boolean;
  acceptsCash: boolean;
}

const FALLBACK_RIDE_MINUTES = 45;
const BUFFER_MIN_DEFAULT = 15;
const BUFFER_MIN_NOW = 5;

/**
 * Rough on-the-ground ride length. Uses Mapbox duration when we have it,
 * doubles for round trips, applies a small cushion for loading/stops.
 * Never less than FALLBACK_RIDE_MINUTES so we don't under-book a slot.
 */
export function estimateRideMinutes(d: BookingDraft): number {
  const base = d.routeDurationMin || FALLBACK_RIDE_MINUTES;
  const withRoundTrip = d.roundTrip ? base * 2 : base;
  const cushion = d.roundTrip ? 20 : 10;
  return Math.max(FALLBACK_RIDE_MINUTES, Math.round(withRoundTrip + cushion));
}

/**
 * Availability check window for checkDriverAvailability.
 *
 * Returns two window pairs:
 *  - start/end: the actual ride window we'd record on the calendar
 *  - checkStart/checkEnd: widened by the driver buffer so back-to-back
 *    bookings leave room to breathe without the buffer leaking into the
 *    stored row
 *
 * Returns null when timeIso isn't resolved yet — caller should skip the check.
 */
export function computeBookingWindow(
  d: BookingDraft,
  opts: { bufferMinutes?: number } = {}
): { startAt: string; endAt: string; checkStart: string; checkEnd: string } | null {
  if (!d.timeIso) return null;
  const start = new Date(d.timeIso).getTime();
  if (Number.isNaN(start)) return null;

  const rideMin = estimateRideMinutes(d);
  const end = start + rideMin * 60_000;

  const buffer =
    opts.bufferMinutes ?? (d.isNow ? BUFFER_MIN_NOW : BUFFER_MIN_DEFAULT);
  const checkStart = start - buffer * 60_000;
  const checkEnd = end + buffer * 60_000;

  return {
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    checkStart: new Date(checkStart).toISOString(),
    checkEnd: new Date(checkEnd).toISOString(),
  };
}

/**
 * Merge GPT-extracted fields into the canonical draft.
 *
 * Deterministic overrides:
 *  - timeIso/timeDisplay/isNow are always re-resolved from timeRaw via
 *    parseNaturalTime, so GPT can't hand us a stale or made-up ISO
 *  - route fields from calculate_route land in routeDistanceMi/routeDurationMin
 *  - riderPrice and driverMinimum are coerced to numbers
 */
export function mergeExtract(
  draft: BookingDraft,
  extract: Record<string, unknown>
): BookingDraft {
  const m: BookingDraft = { ...draft };

  if (typeof extract.pickup === 'string' && extract.pickup.trim()) m.pickup = extract.pickup.trim();
  if (typeof extract.dropoff === 'string' && extract.dropoff.trim()) m.dropoff = extract.dropoff.trim();
  if (typeof extract.stops === 'string') m.stops = extract.stops.trim() || undefined;
  if (typeof extract.roundTrip === 'boolean') m.roundTrip = extract.roundTrip;
  if (typeof extract.isCash === 'boolean') m.isCash = extract.isCash;

  if (typeof extract.time === 'string' && extract.time.trim()) {
    m.timeRaw = extract.time.trim();
  }
  if (m.timeRaw) {
    try {
      const parsed = parseNaturalTime(m.timeRaw);
      m.timeIso = parsed.iso;
      m.timeDisplay = parsed.display;
      m.isNow = parsed.isNow;
    } catch {
      /* leave unresolved */
    }
  }

  const riderPriceNum = coerceNumber(extract.riderPrice);
  if (riderPriceNum !== null) m.riderPrice = riderPriceNum;

  const suggestedNum = coerceNumber(extract.suggestedPrice);
  if (suggestedNum !== null) m.suggestedPrice = suggestedNum;

  const minNum = coerceNumber(extract.driverMinimum);
  if (minNum !== null) m.driverMinimum = minNum;

  const uberNum = coerceNumber((extract as Record<string, unknown>).uberEstimate);
  if (uberNum !== null) m.uberEstimate = uberNum;

  const distNum = coerceNumber((extract as Record<string, unknown>).distanceMiles);
  if (distNum !== null) m.routeDistanceMi = distNum;
  const durNum = coerceNumber((extract as Record<string, unknown>).durationMinutes);
  if (durNum !== null) m.routeDurationMin = durNum;

  return m;
}

export interface MissingSlotsOptions {
  /** When false, don't require riderPrice >= driverMinimum. Default true. */
  enforceMinPrice?: boolean;
  /** When false, don't require explicit payment choice from accepts-both drivers. Default true. */
  requirePaymentSlot?: boolean;
}

/** Which required slots the draft is still missing, in the order we should ask.
 *
 *  When driverPayment is supplied and the driver accepts BOTH cash and card,
 *  the rider must explicitly pick one — `isCash` typed as boolean. Cash-only
 *  and digital-only drivers don't surface a payment slot; the caller should
 *  pre-seed `isCash` from the driver's config in those cases.
 *
 *  Options let admin config disable the price / payment gates without
 *  touching the rest of the flow. */
export function missingSlots(
  d: BookingDraft,
  driverPayment?: DriverPaymentConfig,
  opts: MissingSlotsOptions = {},
): DraftSlot[] {
  const enforceMinPrice = opts.enforceMinPrice !== false;
  const requirePaymentSlot = opts.requirePaymentSlot !== false;

  const missing: DraftSlot[] = [];
  if (!d.pickup) missing.push('pickup');
  if (!d.dropoff) missing.push('dropoff');
  if (!d.timeIso) missing.push('time');
  if (enforceMinPrice) {
    if (!priceValid(d)) missing.push('price');
  } else if (typeof d.riderPrice !== 'number') {
    // Even when admin turns off the floor check, the rider still has to name
    // a number — we just don't compare it to driverMinimum.
    missing.push('price');
  }
  if (driverPayment && requirePaymentSlot) {
    const acceptsBoth = driverPayment.acceptsCash && !driverPayment.cashOnly;
    if (acceptsBoth && typeof d.isCash !== 'boolean') missing.push('payment');
  }
  return missing;
}

/** Draft has everything we need to submit the booking. */
export function isComplete(
  d: BookingDraft,
  driverPayment?: DriverPaymentConfig,
  opts: MissingSlotsOptions = {},
): boolean {
  return missingSlots(d, driverPayment, opts).length === 0;
}

/** Rider price meets or beats the driver minimum. */
export function priceValid(d: BookingDraft): boolean {
  if (typeof d.riderPrice !== 'number' || !Number.isFinite(d.riderPrice)) return false;
  if (typeof d.driverMinimum !== 'number' || !Number.isFinite(d.driverMinimum)) return false;
  return d.riderPrice >= d.driverMinimum;
}

/**
 * Deterministic next question — used as a fallback when GPT fails or as a
 * hint the model can paraphrase. Keeps the flow moving even if the LLM hic.
 */
export function nextQuestion(
  d: BookingDraft,
  driverName: string,
  driverPayment?: DriverPaymentConfig,
): string {
  const next = missingSlots(d, driverPayment)[0];
  switch (next) {
    case 'pickup':
      return 'Where you coming from?';
    case 'dropoff':
      return 'Where you headed?';
    case 'time':
      return 'When do you need the ride?';
    case 'price': {
      const min = d.driverMinimum;
      return min
        ? `${driverName}'s minimum is $${min} — what works for you?`
        : 'What price works for you?';
    }
    case 'payment':
      return `Paying cash or card? (${driverName} takes both)`;
    default:
      return 'Ready to lock this in?';
  }
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
