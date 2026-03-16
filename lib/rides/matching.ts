// Ride Matching Algorithm
// Finds and matches riders with nearest available drivers

import { pool } from '@/lib/db/client';
import { calculateDistance, getBoundingBox, estimateETA, type Coordinates } from '@/lib/geo/distance';

export interface Driver {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  status: string;
  vehicleType: string;
  rating: number;
}

export interface MatchResult {
  driver: Driver;
  distanceToPickup: number;
  estimatedETA: number;
}

/**
 * Find available drivers near pickup location
 * Uses bounding box for efficient spatial query
 */
export async function findNearbyDrivers(params: {
  pickupLocation: Coordinates;
  radiusMiles?: number;
  vehicleType?: string;
}): Promise<MatchResult[]> {
  const radiusMiles = params.radiusMiles || 5; // Default 5 mile radius
  const bounds = getBoundingBox(params.pickupLocation, radiusMiles);

  // Build query with optional vehicle type filter
  const query = `
    SELECT
      d.id,
      d.user_id,
      d.current_latitude as latitude,
      d.current_longitude as longitude,
      d.status,
      d.vehicle_type,
      COALESCE(
        (SELECT AVG(rating)::numeric(3,2)
         FROM ride_ratings
         WHERE driver_id = d.id),
        5.0
      ) as rating
    FROM drivers d
    WHERE
      d.status = 'available'
      AND d.current_latitude IS NOT NULL
      AND d.current_longitude IS NOT NULL
      AND d.current_latitude BETWEEN $1 AND $2
      AND d.current_longitude BETWEEN $3 AND $4
      ${params.vehicleType ? 'AND d.vehicle_type = $5' : ''}
    ORDER BY d.current_latitude, d.current_longitude
    LIMIT 20
  `;

  const queryParams = params.vehicleType
    ? [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng, params.vehicleType]
    : [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng];

  const result = await pool.query(query, queryParams);

  // Calculate exact distances and filter by radius
  const matches: MatchResult[] = result.rows
    .map((row: any) => {
      const driver: Driver = {
        id: row.id,
        userId: row.user_id,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        status: row.status,
        vehicleType: row.vehicle_type,
        rating: parseFloat(row.rating),
      };

      const distanceToPickup = calculateDistance(
        params.pickupLocation,
        { latitude: driver.latitude, longitude: driver.longitude }
      );

      return {
        driver,
        distanceToPickup,
        estimatedETA: estimateETA(distanceToPickup),
      };
    })
    .filter((match: MatchResult) => match.distanceToPickup <= radiusMiles)
    .sort((a: MatchResult, b: MatchResult) => {
      // Primary sort: distance
      // Secondary sort: rating (higher is better)
      if (Math.abs(a.distanceToPickup - b.distanceToPickup) < 0.5) {
        return b.driver.rating - a.driver.rating;
      }
      return a.distanceToPickup - b.distanceToPickup;
    });

  return matches;
}

/**
 * Attempt to match a ride request with the best available driver
 * Returns the matched driver or null if no drivers available
 */
export async function matchRideToDriver(params: {
  rideId: string;
  pickupLocation: Coordinates;
  vehicleType?: string;
}): Promise<Driver | null> {
  const nearbyDrivers = await findNearbyDrivers({
    pickupLocation: params.pickupLocation,
    vehicleType: params.vehicleType,
  });

  if (nearbyDrivers.length === 0) {
    return null;
  }

  // Get the best match (already sorted by distance and rating)
  const bestMatch = nearbyDrivers[0];

  // Update driver status to 'en_route'
  await pool.query(
    `UPDATE drivers
     SET status = 'en_route',
         updated_at = NOW()
     WHERE id = $1 AND status = 'available'
     RETURNING id`,
    [bestMatch.driver.id]
  );

  return bestMatch.driver;
}

/**
 * Notify nearby drivers of a new ride request
 * Returns list of notified driver IDs
 */
export async function notifyNearbyDrivers(params: {
  rideId: string;
  pickupLocation: Coordinates;
  dropoffLocation: Coordinates;
  estimatedFare: number;
}): Promise<string[]> {
  const nearbyDrivers = await findNearbyDrivers({
    pickupLocation: params.pickupLocation,
    radiusMiles: 10, // Wider radius for notifications
  });

  // In production, this would send push notifications
  // For now, return list of driver IDs to notify
  const driverIds = nearbyDrivers
    .slice(0, 5) // Notify top 5 drivers
    .map((match) => match.driver.id);

  console.log(`[MATCHING] Notified ${driverIds.length} drivers for ride ${params.rideId}`);

  return driverIds;
}

/**
 * Check if a specific driver can accept a ride
 */
export async function canDriverAcceptRide(driverId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT status FROM drivers WHERE id = $1`,
    [driverId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  return result.rows[0].status === 'available';
}

/**
 * Update driver availability status
 */
export async function updateDriverStatus(
  driverId: string,
  status: 'available' | 'en_route' | 'on_trip' | 'offline'
): Promise<void> {
  await pool.query(
    `UPDATE drivers
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    [status, driverId]
  );
}

/**
 * Security: Rate limiting for driver matching requests
 * Prevents spam/abuse of matching system
 */
const matchRequestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkMatchRateLimit(riderId: string): boolean {
  const now = Date.now();
  const limit = matchRequestCounts.get(riderId);

  if (!limit || now > limit.resetAt) {
    // Reset counter every 5 minutes
    matchRequestCounts.set(riderId, {
      count: 1,
      resetAt: now + 5 * 60 * 1000,
    });
    return true;
  }

  if (limit.count >= 10) {
    // Max 10 requests per 5 minutes
    return false;
  }

  limit.count++;
  return true;
}
