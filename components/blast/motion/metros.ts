// Per-market metro polygons used by the MetroNeuralNet loader animation.
//
// Coordinates are normalized to a [0..1] × [0..1] viewBox so the renderer can
// scale the polygon freely. (0,0) is top-left; the polygon traces the metro
// boundary clockwise.
//
// These are *hand-curated approximations* — recognizable silhouettes, not
// surveyed boundaries. The follow-up plan is to refine them from Mapbox
// boundary data once the visual style is signed off. Keep vertices in the
// 12-20 range — too few and the shape disappears; too many and the SVG path
// gets noisy at small sizes.

export interface MetroOutline {
  /** Slug must match the `markets.slug` column. */
  slug: string;
  /** Display name — used in the loader's accessible label. */
  name: string;
  /**
   * Clockwise polygon vertices in normalized [0..1] coords.
   * Last point is implicitly connected back to the first.
   */
  polygon: readonly [number, number][];
  /** Center hint for camera framing — average if omitted. */
  focus?: [number, number];
}

// Atlanta — I-285 "Perimeter" inspired oval, slightly squashed N-S with the
// classic suburb bulge to the east (Stone Mountain) and north (Buckhead /
// Sandy Springs / Roswell). The shape is meant to read as ATL at a glance,
// not as a survey-accurate map.
export const ATL_METRO: MetroOutline = {
  slug: 'atl',
  name: 'Atlanta',
  polygon: [
    [0.50, 0.06], // top — Roswell/Alpharetta bulge
    [0.62, 0.08],
    [0.74, 0.16],
    [0.83, 0.28], // NE — Dunwoody
    [0.88, 0.42],
    [0.92, 0.55], // east — Stone Mountain
    [0.88, 0.68],
    [0.80, 0.78], // SE — Decatur
    [0.68, 0.86],
    [0.55, 0.92], // south — Hartsfield
    [0.42, 0.92],
    [0.28, 0.86], // SW — East Point
    [0.16, 0.76],
    [0.10, 0.62], // west — Cumberland
    [0.10, 0.46],
    [0.16, 0.30], // NW — Smyrna
    [0.28, 0.16],
    [0.40, 0.08],
  ],
};

// New Orleans — the famous Crescent City shape, following the Mississippi's
// horseshoe bend. Orleans Parish boundary is roughly bounded by the river
// on the south/west and Lake Pontchartrain on the north.
export const NOLA_METRO: MetroOutline = {
  slug: 'nola',
  name: 'New Orleans',
  polygon: [
    [0.08, 0.36], // Lake Pontchartrain shore — NW
    [0.18, 0.28],
    [0.32, 0.24],
    [0.46, 0.22], // top of crescent
    [0.60, 0.24],
    [0.74, 0.30],
    [0.86, 0.38], // NE — Gentilly / Eastern New Orleans
    [0.92, 0.50],
    [0.90, 0.62],
    [0.82, 0.70], // E
    [0.70, 0.74], // crescent inner bend
    [0.60, 0.70],
    [0.52, 0.62], // French Quarter notch
    [0.46, 0.68],
    [0.40, 0.78], // S — Algiers Point opposite bank
    [0.28, 0.78],
    [0.18, 0.70],
    [0.10, 0.56], // west bank
  ],
};

export const METROS: Record<string, MetroOutline> = {
  atl: ATL_METRO,
  nola: NOLA_METRO,
};

/**
 * Best-effort market resolver — caller can pass an explicit slug, otherwise
 * we try the subdomain ({slug}.hmucashride.com). Falls back to ATL since
 * that's the primary Clerk domain anyway.
 */
export function resolveMetroSlug(explicit?: string | null): string {
  if (explicit && METROS[explicit]) return explicit;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    // Match the first subdomain label against known metros.
    const sub = host.split('.')[0];
    if (METROS[sub]) return sub;
  }
  return 'atl';
}
