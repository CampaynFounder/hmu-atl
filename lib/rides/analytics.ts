// Ride analytics calculator
// Computes distance from GPS trail, duration, and rate metrics

import { sql } from '@/lib/db/client';
import { calculateDistance } from '@/lib/geo/distance';

export interface RideAnalytics {
  totalDistanceMiles: number;
  totalDurationMinutes: number;
  ratePerMile: number;
  ratePerMinute: number;
}

/**
 * Calculate ride analytics from GPS trail and store on ride record.
 * Called non-blocking at ride end.
 */
export async function calculateAndStoreRideAnalytics(rideId: string): Promise<RideAnalytics | null> {
  try {
    // Get ride details
    const rideRows = await sql`
      SELECT started_at, ended_at, driver_payout_amount, final_agreed_price, amount
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return null;

    const ride = rideRows[0] as Record<string, unknown>;
    const startedAt = ride.started_at as string;
    const endedAt = ride.ended_at as string;
    const payoutAmount = Number(ride.driver_payout_amount || ride.final_agreed_price || ride.amount || 0);

    // Calculate duration
    let totalDurationMinutes = 0;
    if (startedAt && endedAt) {
      const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      totalDurationMinutes = Math.max(1, Math.round(diffMs / 60000));
    }

    // Calculate distance from GPS trail
    const gpsPoints = await sql`
      SELECT lat, lng FROM ride_locations
      WHERE ride_id = ${rideId}
      ORDER BY recorded_at ASC
    ` as { lat: string; lng: string }[];

    let totalDistanceMiles = 0;
    for (let i = 1; i < gpsPoints.length; i++) {
      const prev = gpsPoints[i - 1];
      const curr = gpsPoints[i];
      totalDistanceMiles += calculateDistance(
        { latitude: Number(prev.lat), longitude: Number(prev.lng) },
        { latitude: Number(curr.lat), longitude: Number(curr.lng) }
      );
    }

    // Round to 2 decimals
    totalDistanceMiles = Math.round(totalDistanceMiles * 100) / 100;

    // Calculate rates (avoid division by zero)
    const ratePerMile = totalDistanceMiles > 0
      ? Math.round((payoutAmount / totalDistanceMiles) * 100) / 100
      : 0;
    const ratePerMinute = totalDurationMinutes > 0
      ? Math.round((payoutAmount / totalDurationMinutes) * 100) / 100
      : 0;

    // Store on ride record
    await sql`
      UPDATE rides SET
        total_distance_miles = ${totalDistanceMiles},
        total_duration_minutes = ${totalDurationMinutes},
        rate_per_mile = ${ratePerMile},
        rate_per_minute = ${ratePerMinute}
      WHERE id = ${rideId}
    `;

    return { totalDistanceMiles, totalDurationMinutes, ratePerMile, ratePerMinute };
  } catch (error) {
    console.error('Failed to calculate ride analytics:', error);
    return null;
  }
}
