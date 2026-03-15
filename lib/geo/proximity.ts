import { point } from '@turf/helpers';
import distance from '@turf/distance';

// 300 feet in kilometers
const PROXIMITY_THRESHOLD_KM = 300 * 0.0003048;

/**
 * Returns true if the two coordinates are within 300ft of each other.
 */
export function isWithinProximity(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): boolean {
  const p1 = point([lng1, lat1]);
  const p2 = point([lng2, lat2]);
  const distKm = distance(p1, p2, { units: 'kilometers' });
  return distKm <= PROXIMITY_THRESHOLD_KM;
}
