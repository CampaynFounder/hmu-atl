// Shared types for the ride experience (rider + driver).

export type LatLng = { lat: number; lng: number };
export type ViewerRole = 'rider' | 'driver';

/** A ride status as surfaced by the state machine. */
export type RideStatus =
  | 'matched' | 'otw' | 'here' | 'confirming' | 'active'
  | 'in_progress' | 'ended' | 'completed' | 'cancelled' | 'disputed';

export function toLatLng(lat: number | null | undefined, lng: number | null | undefined): LatLng | null {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return null;
  return { lat: Number(lat), lng: Number(lng) };
}
