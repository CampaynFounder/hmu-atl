import { neon } from '@neondatabase/serverless';
import type { Ride, RideLocation, User } from './types';

function sql() {
  return neon(process.env.DATABASE_URL!);
}

export async function getRideById(rideId: string): Promise<Ride | null> {
  const db = sql();
  const rows = await db`
    SELECT * FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  return (rows[0] as Ride) ?? null;
}

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const db = sql();
  const rows = await db`
    SELECT * FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  return (rows[0] as User) ?? null;
}

export async function updateRideToOtw(rideId: string): Promise<Ride> {
  const db = sql();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE rides
    SET status = 'otw', updated_at = ${now}
    WHERE id = ${rideId}
    RETURNING *
  `;
  return rows[0] as Ride;
}

export async function updateRideToHere(rideId: string): Promise<Ride> {
  const db = sql();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE rides
    SET status = 'here', updated_at = ${now}
    WHERE id = ${rideId}
    RETURNING *
  `;
  return rows[0] as Ride;
}

export async function updateRideToActive(rideId: string): Promise<Ride> {
  const db = sql();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE rides
    SET status = 'active', started_at = ${now}, updated_at = ${now}
    WHERE id = ${rideId}
    RETURNING *
  `;
  return rows[0] as Ride;
}

export async function updateRideToEnded(
  rideId: string,
  disputeWindowExpiresAt: Date,
): Promise<Ride> {
  const db = sql();
  const now = new Date().toISOString();
  const disputeExpiry = disputeWindowExpiresAt.toISOString();
  const rows = await db`
    UPDATE rides
    SET status = 'ended',
        ended_at = ${now},
        driver_confirmed_end = true,
        dispute_window_expires_at = ${disputeExpiry},
        updated_at = ${now}
    WHERE id = ${rideId}
    RETURNING *
  `;
  return rows[0] as Ride;
}

export async function cancelRide(rideId: string): Promise<Ride> {
  const db = sql();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE rides
    SET status = 'cancelled', updated_at = ${now}
    WHERE id = ${rideId}
    RETURNING *
  `;
  return rows[0] as Ride;
}

export async function insertRideLocation(params: {
  ride_id: string;
  lat: number;
  lng: number;
}): Promise<RideLocation> {
  const db = sql();
  const now = new Date().toISOString();
  const rows = await db`
    INSERT INTO ride_locations (id, ride_id, lat, lng, recorded_at)
    VALUES (gen_random_uuid(), ${params.ride_id}, ${params.lat}, ${params.lng}, ${now})
    RETURNING *
  `;
  return rows[0] as RideLocation;
}

export async function getLastRideLocation(rideId: string): Promise<RideLocation | null> {
  const db = sql();
  const rows = await db`
    SELECT * FROM ride_locations
    WHERE ride_id = ${rideId}
    ORDER BY recorded_at DESC
    LIMIT 1
  `;
  return (rows[0] as RideLocation) ?? null;
}
