// Shared types + defaults for the configurable banner shown at the top of
// /rider/browse. Stored in platform_config row 'rider_browse.banner'.
// Read server-side at page render via getPlatformConfig (60s isolate cache);
// updated through /api/admin/rider-browse-banner.

export interface RiderBrowseBannerConfig {
  enabled: boolean;
  // Big headline shown in the laser-outlined block.
  headline: string;
  // Optional secondary line. Empty string hides it.
  subhead: string;
  // CTA button label (rendered to the right of the headline on desktop, below
  // it on mobile).
  cta_text: string;
  // Where the banner links. Internal paths (start with `/`) stay in-tab;
  // anything starting with http(s) opens in a new tab.
  cta_url: string;
}

// Pre-seeded for the driver-recruit pitch. The row is also seeded in prod so
// the banner shows even before an admin opens the editor.
export const RIDER_BROWSE_BANNER_DEFAULTS: RiderBrowseBannerConfig = {
  enabled: true,
  headline: 'Make More Driving',
  subhead: '',
  cta_text: 'Apply Here',
  cta_url: '/driver/express',
};

export const RIDER_BROWSE_BANNER_KEY = 'rider_browse.banner';

// Loose validation used by the API. Trims strings, clamps lengths so an
// admin can't ship a 10kb payload that breaks the layout, coerces enabled to
// boolean. Anything not present falls back to defaults.
export function sanitizeRiderBrowseBanner(
  input: Partial<RiderBrowseBannerConfig> | null | undefined,
): RiderBrowseBannerConfig {
  const src = (input ?? {}) as Partial<RiderBrowseBannerConfig>;
  const clamp = (s: unknown, max: number): string =>
    (typeof s === 'string' ? s : '').trim().slice(0, max);
  const url = clamp(src.cta_url, 500);
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : RIDER_BROWSE_BANNER_DEFAULTS.enabled,
    headline: clamp(src.headline, 80) || RIDER_BROWSE_BANNER_DEFAULTS.headline,
    subhead: clamp(src.subhead, 140),
    cta_text: clamp(src.cta_text, 32) || RIDER_BROWSE_BANNER_DEFAULTS.cta_text,
    // Allow internal paths or http(s) URLs only. Anything else collapses to
    // the default so we can never inject a `javascript:` href.
    cta_url: /^(https?:\/\/|\/)/.test(url) ? url : RIDER_BROWSE_BANNER_DEFAULTS.cta_url,
  };
}
