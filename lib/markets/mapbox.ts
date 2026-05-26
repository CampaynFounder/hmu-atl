interface MarketMapboxConfig {
  bbox: string;
  citySuffix: string;
  center: [number, number]; // [lng, lat] — Mapbox convention
}

const MARKET_MAPBOX: Record<string, MarketMapboxConfig> = {
  atl: {
    bbox: '-84.8,33.5,-84.1,34.1',
    citySuffix: 'Atlanta, GA',
    center: [-84.388, 33.749],
  },
  nola: {
    bbox: '-90.4,29.6,-89.7,30.3',
    citySuffix: 'New Orleans, LA',
    center: [-90.0715, 29.9511],
  },
};

export function getMarketMapbox(slug?: string | null): MarketMapboxConfig {
  return MARKET_MAPBOX[slug || 'atl'] ?? MARKET_MAPBOX.atl;
}
