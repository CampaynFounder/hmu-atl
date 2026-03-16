// Geolocation utilities for distance calculation and nearby search
// Uses Haversine formula for accurate distance on Earth's surface

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param point1 First coordinate
 * @param point2 Second coordinate
 * @returns Distance in miles
 */
export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates
): number {
  const EARTH_RADIUS_MILES = 3958.8;

  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const latDiff = toRadians(point2.latitude - point1.latitude);
  const lonDiff = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(lonDiff / 2) *
      Math.sin(lonDiff / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

/**
 * Calculate bounding box for nearby search
 * Returns lat/lng bounds for SQL query optimization
 */
export function getBoundingBox(
  center: Coordinates,
  radiusMiles: number
): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  const EARTH_RADIUS_MILES = 3958.8;

  // Calculate lat/lng degree differences
  const latDiff = (radiusMiles / EARTH_RADIUS_MILES) * (180 / Math.PI);
  const lngDiff =
    (radiusMiles / (EARTH_RADIUS_MILES * Math.cos(toRadians(center.latitude)))) *
    (180 / Math.PI);

  return {
    minLat: center.latitude - latDiff,
    maxLat: center.latitude + latDiff,
    minLng: center.longitude - lngDiff,
    maxLng: center.longitude + lngDiff,
  };
}

/**
 * Estimate ETA based on distance and average speed
 * @param distanceMiles Distance in miles
 * @param averageSpeedMph Average speed (default 30 mph for city driving)
 * @returns ETA in minutes
 */
export function estimateETA(
  distanceMiles: number,
  averageSpeedMph: number = 30
): number {
  const hours = distanceMiles / averageSpeedMph;
  const minutes = Math.ceil(hours * 60);
  return minutes;
}

/**
 * Validate coordinates are within Atlanta metro area
 * Rough bounds: 33.5°N to 34.1°N, -84.8°W to -84.1°W
 */
export function isInAtlantaMetro(coords: Coordinates): boolean {
  const ATLANTA_BOUNDS = {
    minLat: 33.5,
    maxLat: 34.1,
    minLng: -84.8,
    maxLng: -84.1,
  };

  return (
    coords.latitude >= ATLANTA_BOUNDS.minLat &&
    coords.latitude <= ATLANTA_BOUNDS.maxLat &&
    coords.longitude >= ATLANTA_BOUNDS.minLng &&
    coords.longitude <= ATLANTA_BOUNDS.maxLng
  );
}

/**
 * Validate coordinates are valid lat/lng values
 */
export function isValidCoordinates(coords: Coordinates): boolean {
  return (
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180 &&
    !isNaN(coords.latitude) &&
    !isNaN(coords.longitude)
  );
}

// Helper: Convert degrees to radians
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
