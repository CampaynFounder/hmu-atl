import { sql } from '@/lib/db/client';

/**
 * Per-market booking-type rollout flags. Backed by the boolean columns on
 * `markets` (see 2026-06-15-booking-type-toggles.sql). Edited from the
 * superadmin at /admin/booking-types, read by the booking create routes, the
 * driver feed, and the rider availability endpoint.
 */
export interface BookingFlags {
  direct: boolean;
  blast: boolean;
  downBad: boolean;
  delivery: boolean;
}

/** Camel-case booking type keys used across the API + mobile client. */
export type BookingType = keyof BookingFlags;

/** Maps a BookingType to its `markets` boolean column. Allowlist — never interpolate raw input. */
export const BOOKING_TYPE_COLUMN: Record<BookingType, string> = {
  direct: 'direct_enabled',
  blast: 'blast_enabled',
  downBad: 'down_bad_enabled',
  delivery: 'delivery_enabled',
};

/** Human-readable labels for rejection copy + the admin UI. */
export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  direct: 'Direct booking',
  blast: 'Blast',
  downBad: 'Down Bad',
  delivery: 'Delivery',
};

/**
 * Read all four rollout flags for a market in one query. A missing row (should
 * never happen — callers resolve a real market first) reads as all-disabled,
 * which fails closed.
 */
export async function getMarketBookingFlags(marketId: string): Promise<BookingFlags> {
  try {
    const rows = (await sql`
      SELECT direct_enabled, blast_enabled, down_bad_enabled, delivery_enabled
      FROM markets WHERE id = ${marketId} LIMIT 1
    `) as Array<{
      direct_enabled: boolean;
      blast_enabled: boolean;
      down_bad_enabled: boolean;
      delivery_enabled: boolean;
    }>;
    const r = rows[0];
    return {
      direct: !!r?.direct_enabled,
      blast: !!r?.blast_enabled,
      downBad: !!r?.down_bad_enabled,
      delivery: !!r?.delivery_enabled,
    };
  } catch (err) {
    // Deploy ordering: the Worker ships ~40s before migrations run, so during
    // that window these columns may not exist yet (Postgres 42703). Fall back
    // to pre-feature behavior (all available) so existing flows don't 500.
    // Blast keeps its own pre-existing markets.blast_enabled check elsewhere.
    if ((err as { code?: string })?.code === '42703') {
      return { direct: true, blast: true, downBad: true, delivery: true };
    }
    throw err;
  }
}

/**
 * True when `type` is live in `marketId`. Convenience wrapper around
 * getMarketBookingFlags for the single-type checks in create routes.
 */
export async function isBookingTypeEnabled(marketId: string, type: BookingType): Promise<boolean> {
  const flags = await getMarketBookingFlags(marketId);
  return flags[type];
}
