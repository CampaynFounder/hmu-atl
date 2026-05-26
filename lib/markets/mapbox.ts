interface MarketMapboxConfig {
  bbox: string;
  citySuffix: string;
  center: [number, number]; // [lng, lat] — Mapbox convention
}

const MARKET_MAPBOX: Record<string, MarketMapboxConfig> = {
  // Live markets
  atl: { bbox: '-84.8,33.5,-84.1,34.1',  citySuffix: 'Atlanta, GA',           center: [-84.388,  33.749]  },
  nola: { bbox: '-90.4,29.6,-89.7,30.3', citySuffix: 'New Orleans, LA',        center: [-90.0715, 29.9511] },
  // Georgia
  aug:  { bbox: '-82.6,33.0,-81.5,33.9', citySuffix: 'Augusta, GA',            center: [-82.0105, 33.4735] },
  macon:{ bbox: '-84.3,32.3,-83.0,33.4', citySuffix: 'Macon, GA',              center: [-83.6324, 32.8407] },
  sav:  { bbox: '-81.6,31.6,-80.6,32.5', citySuffix: 'Savannah, GA',           center: [-81.0912, 32.0809] },
  vld:  { bbox: '-83.7,30.4,-82.8,31.2', citySuffix: 'Valdosta, GA',           center: [-83.2785, 30.8327] },
  csg:  { bbox: '-85.5,32.0,-84.5,32.9', citySuffix: 'Columbus, GA',           center: [-84.9877, 32.4610] },
  // Florida
  tpa:  { bbox: '-83.1,27.4,-81.8,28.5', citySuffix: 'Tampa, FL',              center: [-82.4572, 27.9506] },
  mia:  { bbox: '-80.9,25.3,-79.6,26.5', citySuffix: 'Miami, FL',              center: [-80.2000, 26.0000] },
  orl:  { bbox: '-82.1,28.0,-80.7,29.1', citySuffix: 'Orlando, FL',            center: [-81.3792, 28.5383] },
  // Tennessee
  mem:  { bbox: '-90.8,34.6,-89.3,35.7', citySuffix: 'Memphis, TN',            center: [-90.0490, 35.1495] },
  bna:  { bbox: '-87.5,35.6,-86.1,36.7', citySuffix: 'Nashville, TN',          center: [-86.7816, 36.1627] },
  knx:  { bbox: '-84.6,35.5,-83.3,36.5', citySuffix: 'Knoxville, TN',          center: [-83.9207, 35.9606] },
  cha:  { bbox: '-85.9,34.6,-84.8,35.5', citySuffix: 'Chattanooga, TN',        center: [-85.3097, 35.0456] },
  // Alabama
  bhm:  { bbox: '-87.4,33.0,-86.2,34.0', citySuffix: 'Birmingham, AL',         center: [-86.8104, 33.5186] },
  mgm:  { bbox: '-86.8,31.9,-85.8,32.8', citySuffix: 'Montgomery, AL',         center: [-86.3000, 32.3668] },
  // Texas
  hou:  { bbox: '-96.3,29.0,-94.5,30.6', citySuffix: 'Houston, TX',            center: [-95.3698, 29.7604] },
  dfw:  { bbox: '-97.7,32.1,-95.9,33.5', citySuffix: 'Dallas, TX',             center: [-96.7970, 32.7767] },
  // Southeast / Midwest
  clt:  { bbox: '-81.5,34.7,-80.2,35.7', citySuffix: 'Charlotte, NC',          center: [-80.8431, 35.2271] },
  chi:  { bbox: '-88.5,41.2,-86.7,42.5', citySuffix: 'Chicago, IL',            center: [-87.6298, 41.8781] },
  dtw:  { bbox: '-83.8,41.8,-82.3,42.9', citySuffix: 'Detroit, MI',            center: [-83.0458, 42.3314] },
  stl:  { bbox: '-90.9,38.1,-89.5,39.2', citySuffix: 'St. Louis, MO',          center: [-90.1994, 38.6270] },
  cin:  { bbox: '-85.2,38.6,-83.9,39.6', citySuffix: 'Cincinnati, OH',         center: [-84.5120, 39.1031] },
};

export function getMarketMapbox(slug?: string | null): MarketMapboxConfig {
  return MARKET_MAPBOX[slug || 'atl'] ?? MARKET_MAPBOX.atl;
}
