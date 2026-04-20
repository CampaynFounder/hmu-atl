// Per-market branding for pre-auth marketing pages (SEO metadata, canonical
// URLs, hero city labels). Keyed by slug to keep marketing pages synchronous
// — they don't need a DB hit to render metadata. When branding becomes more
// complex (custom OG images, regional taglines), move this to a DB read.
//
// Contract: every market.subdomain MUST have a matching entry here. Missing
// entries fall through to ATL so the page renders something sensible.

export interface MarketBranding {
  slug: string;
  host: string;        // <sub>.hmucashride.com
  city: string;        // Display name for hero / SEO title, e.g. "Atlanta"
  cityShort: string;   // Short form used in copy, e.g. "ATL" / "N.O."
  ogImage: string;     // Absolute URL of the Open Graph image
}

const BRANDINGS: Record<string, MarketBranding> = {
  atl: {
    slug: 'atl',
    host: 'atl.hmucashride.com',
    city: 'Atlanta',
    cityShort: 'ATL',
    ogImage: 'https://atl.hmucashride.com/og-image.jpeg',
  },
  nola: {
    slug: 'nola',
    host: 'nola.hmucashride.com',
    city: 'New Orleans',
    cityShort: 'NOLA',
    // TODO(nola): swap to NOLA-specific OG asset once design provides one.
    ogImage: 'https://atl.hmucashride.com/og-image.jpeg',
  },
};

export function getMarketBranding(slug: string | null | undefined): MarketBranding {
  if (!slug) return BRANDINGS.atl;
  return BRANDINGS[slug.toLowerCase()] || BRANDINGS.atl;
}
