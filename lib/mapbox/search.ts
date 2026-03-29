// Mapbox Search Box REST API wrapper
// Uses session-based billing — all keystrokes in one search = 1 billable session

const MAPBOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

// Atlanta metro bounding box
const ATLANTA_BBOX = '-84.8,33.5,-84.1,34.1';

export interface SuggestResult {
  name: string;
  full_address: string;
  mapbox_id: string;
}

export interface RetrieveResult {
  name: string;
  full_address: string;
  latitude: number;
  longitude: number;
  mapbox_id: string;
}

export async function suggestAddresses(
  query: string,
  sessionToken: string,
  proximity?: { lat: number; lng: number }
): Promise<SuggestResult[]> {
  if (!query || query.length < 2) return [];

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN not set');

  const params = new URLSearchParams({
    q: query,
    access_token: token,
    session_token: sessionToken,
    country: 'us',
    bbox: ATLANTA_BBOX,
    limit: '6',
    types: 'address,poi,place,neighborhood,locality',
    language: 'en',
  });

  if (proximity) {
    params.set('proximity', `${proximity.lng},${proximity.lat}`);
  }

  const res = await fetch(`${MAPBOX_BASE}/suggest?${params.toString()}`);
  if (!res.ok) {
    console.error('Mapbox suggest failed:', res.status, await res.text());
    return [];
  }

  const data = await res.json();
  return (data.suggestions || []).map((s: Record<string, unknown>) => ({
    name: s.name as string,
    full_address: s.full_address as string || s.place_formatted as string || '',
    mapbox_id: s.mapbox_id as string,
  }));
}

export async function retrieveAddress(
  mapboxId: string,
  sessionToken: string
): Promise<RetrieveResult | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN not set');

  const params = new URLSearchParams({
    access_token: token,
    session_token: sessionToken,
  });

  const res = await fetch(`${MAPBOX_BASE}/retrieve/${mapboxId}?${params.toString()}`);
  if (!res.ok) {
    console.error('Mapbox retrieve failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.geometry.coordinates as [number, number];

  return {
    name: feature.properties.name as string,
    full_address: feature.properties.full_address as string || feature.properties.place_formatted as string || '',
    latitude,
    longitude,
    mapbox_id: mapboxId,
  };
}
