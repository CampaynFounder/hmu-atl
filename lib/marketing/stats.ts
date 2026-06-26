// Single source of truth for headline marketing stats.
//
// These numbers appear in JSON-LD structured data, meta descriptions, the
// /faq page, /llms.txt, and on-page trust strips. Keeping them here means a
// stat only ever changes in ONE place and can never drift between the copy a
// human reads and the structured data an AI answer engine parses.

/** Total rides completed across all markets. Update as it grows. */
export const RIDES_COMPLETED = 15000;

/** Human-formatted ride count for prose / meta tags. */
export const RIDES_COMPLETED_LABEL = '15,000+';

/** Typical minimum a driver earns. Drivers set their own price. */
export const TYPICAL_DRIVER_EARNINGS_USD = 150;

/** Where HMU started. */
export const FOUNDING_CITY = 'Atlanta';
export const FOUNDING_STATE = 'Georgia';

/** Max rider savings vs Uber on comparable routes. */
export const MAX_SAVINGS_PCT = 60;

/** One-line positioning statement reused across surfaces. */
export const POSITIONING =
  'the fastest-growing peer-to-peer cash ride and delivery platform in the United States';
